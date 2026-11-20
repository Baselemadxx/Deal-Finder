'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MessageSquare, Send, Sparkles, X } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  mode?: 'llm' | 'local-fallback';
  model?: string;
}

const STARTER_PROMPTS = [
  "Show this week's pre-foreclosures in Fulton",
  'Which leads stack tax delinquency and stale listing?',
  'Top absentee-owner deals in DeKalb or Cobb',
  'Show all properties with upcoming auctions',
];

function renderFormattedText(text: string, onNavigate?: () => void) {
  // Render markdown links like [View Lead](/leads/123) and **bold** cleanly
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    const parts = line.split(/(\[[^\]]+\]\(\/leads\/[^)]+\)|\*\*[^*]+\*\*)/g);
    return (
      <p key={lineIdx} className={line.trim() === '' ? 'h-2' : 'leading-relaxed'}>
        {parts.map((part, idx) => {
          const linkMatch = part.match(/^\[([^\]]+)\]\((\/leads\/[^)]+)\)$/);
          if (linkMatch) {
            return (
              <Link
                key={idx}
                href={linkMatch[2]}
                onClick={onNavigate}
                className="font-semibold text-blue-600 underline hover:text-blue-800"
              >
                {linkMatch[1]}
              </Link>
            );
          }
          const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
          if (boldMatch) {
            return (
              <strong key={idx} className="font-semibold text-slate-900">
                {boldMatch[1]}
              </strong>
            );
          }
          return <span key={idx}>{part}</span>;
        })}
      </p>
    );
  });
}

export function ChatDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const nextHistory: Message[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Chat request failed');
      }
      setMessages([
        ...nextHistory,
        {
          role: 'assistant',
          content: data.reply,
          mode: data.mode,
          model: data.model,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-400" />
            <div>
              <h2 className="text-sm font-bold">Deal Finder AI Assistant</h2>
              <p className="text-[11px] text-slate-300">Ask questions about leads in your database</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
            aria-label="Close chat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <div className="mb-1 flex items-center gap-1.5 font-semibold text-slate-800">
                  <MessageSquare className="h-4 w-4" />
                  Grounded in your live lead database
                </div>
                Ask about counties, stacked distress signals, upcoming auctions, or recent pre-foreclosures.
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Try asking
                </div>
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    &ldquo;{prompt}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm ${
                  m.role === 'user'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-800'
                }`}
              >
                {m.role === 'user' ? m.content : renderFormattedText(m.content, onClose)}
                {m.model && (
                  <div className="mt-2 border-t border-slate-200 pt-1 text-[10px] text-slate-400">
                    {m.mode === 'llm' ? `Model: ${m.model}` : 'Local query fallback (set LLM_API_KEY for LLM)'}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
                Querying your lead database...
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="border-t border-slate-200 bg-white p-3"
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your leads..."
              className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-3.5 py-2.5 text-white transition hover:bg-slate-800 disabled:opacity-40"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
