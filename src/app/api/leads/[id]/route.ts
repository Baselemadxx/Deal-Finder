import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PatchLeadSchema = z.object({
  status: z.enum(['active', 'contacted', 'under_contract', 'dead', 'sold']).optional(),
  notes: z.string().max(10000).optional(),
  skip_trace_status: z.enum(['not_started', 'in_progress', 'completed']).optional(),
  skip_trace_notes: z.string().max(10000).optional(),
});

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const db = getDb();
    const result = await db.getLeadById(id);
    if (!result) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load lead' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const parsed = PatchLeadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid update payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const db = getDb();
    const updated = await db.updateLeadDetails(id, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    const full = await db.getLeadById(id);
    return NextResponse.json(full);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update lead' },
      { status: 500 }
    );
  }
}
