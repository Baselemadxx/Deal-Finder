import { getDb } from './db';
import { DISTRESS_TYPE_LABELS, Lead } from './types';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  reply: string;
  model: string;
  mode: 'llm' | 'local-fallback';
  matchedLeadIds: string[];
}

function summarizeLeadForContext(lead: Lead): string {
  const signals = lead.distress_types.map((d) => DISTRESS_TYPE_LABELS[d] ?? d).join(', ');
  return [
    `- ID: ${lead.id}`,
    `Address: ${lead.address}${lead.city ? `, ${lead.city}` : ''}, ${lead.county} County, ${lead.state}`,
    `Score: ${lead.motivation_score}/100`,
    `Signals: [${signals}]`,
    `Status: ${lead.status}`,
    `FirstSeen: ${lead.first_seen_at.slice(0, 10)}`,
    lead.auction_date ? `Auction: ${lead.auction_date}` : null,
    lead.tax_delinquent_amount ? `DelinquentTax: $${lead.tax_delinquent_amount.toLocaleString()}` : null,
    lead.owner_name ? `Owner: ${lead.owner_name}` : null,
    lead.enrichment?.absenteeOwner ? `Absentee: Yes` : null,
    `Link: /leads/${lead.id}`,
  ]
    .filter(Boolean)
    .join(' | ');
}

function runLocalFallbackQuery(question: string, leads: Lead[]): { reply: string; matchedLeadIds: string[] } {
  const q = question.toLowerCase();
  let filtered = leads.filter((l) => l.status !== 'dead');

  // Filter by county if mentioned
  const counties = Array.from(new Set(leads.map((l) => l.county)));
  const mentionedCounties = counties.filter((c) => q.includes(c.toLowerCase()));
  if (mentionedCounties.length > 0) {
    filtered = filtered.filter((l) =>
      mentionedCounties.some((mc) => mc.toLowerCase() === l.county.toLowerCase())
    );
  }

  // Filter by distress signals if mentioned
  const signalMatchers: Array<{ pattern: RegExp; signal: Lead['primary_distress_type'] }> = [
    { pattern: /pre[- ]?foreclosure/i, signal: 'pre_foreclosure' },
    { pattern: /foreclosure auction|sheriff/i, signal: 'foreclosure_auction' },
    { pattern: /tax sale/i, signal: 'tax_sale' },
    { pattern: /tax delinquen/i, signal: 'tax_delinquent' },
    { pattern: /stale|120/i, signal: 'stale_120_plus' },
    { pattern: /lis pendens/i, signal: 'lis_pendens' },
    { pattern: /tax deed/i, signal: 'tax_deed' },
    { pattern: /hud|homepath|homesteps|usda|gov|reo/i, signal: 'gov_reo' },
  ];

  const requiredSignals = signalMatchers
    .filter((m) => m.pattern.test(q))
    .map((m) => m.signal);

  if (requiredSignals.length > 0) {
    const mustStack = /stack|both|and|combine|multiple/i.test(q) && requiredSignals.length >= 2;
    filtered = filtered.filter((l) =>
      mustStack
        ? requiredSignals.every((s) => l.distress_types.includes(s))
        : requiredSignals.some((s) => l.distress_types.includes(s))
    );
  } else if (/stack|multiple/i.test(q)) {
    filtered = filtered.filter((l) => l.distress_types.length >= 2);
  }

  if (/this week|past 7|last 7|recent|new/i.test(q)) {
    const weekAgo = Date.now() - 7 * 86400 * 1000;
    filtered = filtered.filter((l) => new Date(l.first_seen_at).getTime() >= weekAgo);
  }

  if (/absentee|out[- ]of[- ]state/i.test(q)) {
    filtered = filtered.filter((l) => l.enrichment?.absenteeOwner);
  }

  filtered.sort((a, b) => b.motivation_score - a.motivation_score);
  const top = filtered.slice(0, 10);

  if (top.length === 0) {
    return {
      reply:
        'No leads in the database matched all of those criteria. Try broadening your county, date range, or distress signal filter.\n\n_(Tip: Add `LLM_API_KEY` from Google AI Studio in `.env.local` for full natural-language AI analysis.)_',
      matchedLeadIds: [],
    };
  }

  const lines = top.map(
    (l, i) =>
      `${i + 1}. **${l.address}** (${l.county}, ${l.state}) — Score **${l.motivation_score}/100** | ${l.distress_types
        .map((d) => DISTRESS_TYPE_LABELS[d] ?? d)
        .join(' + ')}${l.auction_date ? ` | Auction ${l.auction_date}` : ''} — [View Lead](/leads/${l.id})`
  );

  return {
    reply: `Found **${filtered.length}** matching lead${filtered.length === 1 ? '' : 's'} (showing top ${top.length}):\n\n${lines.join('\n')}\n\n_(Running in local query mode because \`LLM_API_KEY\` is not set yet. Set \`LLM_API_KEY\` to enable ${process.env.LLM_MODEL || 'gemini-2.5-flash'}.)_`,
    matchedLeadIds: top.map((l) => l.id),
  };
}

export async function answerLeadChat(question: string, history: ChatTurn[] = []): Promise<ChatResponse> {
  const model = process.env.LLM_MODEL || 'gemini-2.5-flash';
  const apiKey = process.env.LLM_API_KEY?.trim();

  const db = getDb();
  const [summary, leads] = await Promise.all([
    db.getDashboardSummary(),
    db.getLeads({ sortBy: 'motivation_score', sortDir: 'desc', limit: 150 }),
  ]);

  if (!apiKey) {
    const fallback = runLocalFallbackQuery(question, leads);
    return {
      reply: fallback.reply,
      model,
      mode: 'local-fallback',
      matchedLeadIds: fallback.matchedLeadIds,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const leadContext = leads.map(summarizeLeadForContext).join('\n');

  const systemInstruction = [
    'You are the Distress Deal Finder assistant for a real estate wholesaler.',
    `Today's date is ${today}.`,
    'Answer questions ONLY using the verified database records provided below. Never invent addresses, phone numbers, or leads.',
    'When referencing a property, include its address, county, motivation score, distress signals, and a markdown link `[Open Lead](/leads/<ID>)`.',
    'Be concise, practical, and mobile-friendly (bulleted lists work best).',
    '',
    `DATABASE SUMMARY: Total Leads=${summary.totalLeads}, Active=${summary.totalActive}, New Today=${summary.newToday}, Stale 120+=${summary.stale120Count}`,
    `BY COUNTY: ${summary.byCounty.map((c) => `${c.county} (${c.state}): ${c.count}`).join(', ')}`,
    '',
    'LEADS IN DATABASE:',
    leadContext || '(No leads in database yet.)',
  ].join('\n');

  const contents = [
    ...history.slice(-6).map((turn) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    })),
    {
      role: 'user',
      parts: [{ text: question }],
    },
  ];

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API error (${model}, HTTP ${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const reply =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim() || 'I could not generate a response from the model.';

  const matchedLeadIds = leads.filter((l) => reply.includes(l.id)).map((l) => l.id);

  return {
    reply,
    model,
    mode: 'llm',
    matchedLeadIds,
  };
}
