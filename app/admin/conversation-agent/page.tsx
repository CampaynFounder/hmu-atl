import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getConfig } from '@/lib/conversation/config';
import { listPersonas } from '@/lib/conversation/personas';
import { listThreads, getThreadStats } from '@/lib/conversation/threads';
import ConversationAgentClient from './conversation-agent-client';

export default async function ConversationAgentPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');
  const rows = await sql`SELECT is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!rows.length || !(rows[0] as { is_admin: boolean }).is_admin) redirect('/');

  const flagRows = await sql`SELECT enabled FROM feature_flags WHERE slug = 'conversation_agent' LIMIT 1`;
  const flagEnabled = !!(flagRows[0] as { enabled: boolean } | undefined)?.enabled;

  const [config, personas, { threads, total }, stats] = await Promise.all([
    getConfig(),
    listPersonas(),
    listThreads({ limit: 50 }),
    getThreadStats(),
  ]);

  return (
    <ConversationAgentClient
      flagEnabled={flagEnabled}
      initialConfig={{
        ...config,
        updated_at: config.updated_at.toString(),
      }}
      initialPersonas={personas.map(p => ({
        ...p,
        created_at: p.created_at.toString(),
        updated_at: p.updated_at.toString(),
      }))}
      initialThreads={threads.map(t => ({
        ...t,
        created_at: t.created_at.toString(),
        updated_at: t.updated_at.toString(),
        last_outbound_at: t.last_outbound_at?.toString() ?? null,
        last_inbound_at: t.last_inbound_at?.toString() ?? null,
        vision_delivered_at: t.vision_delivered_at?.toString() ?? null,
        opted_out_at: t.opted_out_at?.toString() ?? null,
      }))}
      totalThreads={total}
      stats={stats}
    />
  );
}
