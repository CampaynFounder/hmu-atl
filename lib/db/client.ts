// Neon Database Client
// Used by all agents for database access

import { neon, neonConfig, Pool } from '@neondatabase/serverless';

// Configure Neon for serverless environments
neonConfig.fetchConnectionCache = true;

// Pooled connection for serverless functions (recommended for most queries)
// Only initialize if DATABASE_URL is available (skip during build time)
export const sql = process.env.DATABASE_URL
  ? neon(process.env.DATABASE_URL)
  : (() => { throw new Error('DATABASE_URL not configured'); }) as any;

// Direct connection pool for transactions and complex queries
export const pool = process.env.DATABASE_URL_UNPOOLED
  ? new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED })
  : null as any;

// Note: For parameterized queries, use the sql template tag directly:
// const result = await sql`SELECT * FROM users WHERE id = ${userId}`;
// This helper is kept for backwards compatibility but may be removed in future

// Helper: Execute within a transaction
export async function transaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
