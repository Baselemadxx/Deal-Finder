import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { LeadDetailClient } from '@/components/LeadDetailClient';

export const dynamic = 'force-dynamic';

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const found = await db.getLeadById(id);

  if (!found) {
    notFound();
  }

  return <LeadDetailClient initialLead={found.lead} initialHistory={found.history} />;
}
