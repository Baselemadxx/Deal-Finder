import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { answerLeadChat } from '@/lib/chat';

export const dynamic = 'force-dynamic';

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(1500),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid chat message' }, { status: 400 });
    }

    const response = await answerLeadChat(parsed.data.message, parsed.data.history ?? []);
    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Chat request failed' },
      { status: 500 }
    );
  }
}
