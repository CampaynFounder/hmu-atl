// Stripe idempotency helpers for payment holds.
//
// A Stripe idempotency key binds to the exact request body of its FIRST use for
// 24h. Our old keys were `hold_{rideId}_{amount}` / `blast_deposit_{blastId}` —
// fixed for a given ride/blast. So once a decline bound the key to the failed
// card, every retry (even with a new card) reused the same key with a different
// body and Stripe rejected it ("Keys for idempotent requests can only be used
// with the same parameters they were first used with"). Pull Up became
// permanently un-recoverable, which drove the cancel→rebook→cancel loop.
//
// The key now folds in two things:
//   • the payment method — a new card yields a fresh key immediately
//   • an increment-on-failure attempt counter — bumped ONLY after a failed
//     authorization, so a deliberate retry (new card OR the same card after the
//     rider tops it up) gets a fresh key, while an accidental double-tap reuses
//     the same key and Stripe dedups it to a single hold.

import { sql } from '@/lib/db/client';

/** Build the hold idempotency key. `prefix` is e.g. 'hold' or 'blast_deposit'. */
export function holdIdempotencyKey(
  prefix: string,
  id: string,
  amountCents: number,
  paymentMethodId: string,
  attempt: number,
): string {
  return `${prefix}_${id}_${amountCents}_${paymentMethodId}_a${attempt}`;
}

/**
 * Read the current retry generation for a hold. Tolerant of the column not
 * existing yet (pre-migration / local dev) — falls back to 0, which degrades
 * gracefully to payment-method-only keying.
 */
export async function readHoldAttempt(
  table: 'rides' | 'hmu_posts',
  column: 'hold_attempt' | 'deposit_attempt',
  id: string,
): Promise<number> {
  try {
    // Identifiers are compile-time literals from the union types above, never
    // user input, so the interpolation here is safe.
    const rows = (await sql.query(
      `SELECT ${column} AS attempt FROM ${table} WHERE id = $1 LIMIT 1`,
      [id],
    )) as Array<{ attempt: number | null }>;
    return Number(rows[0]?.attempt ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Bump the retry generation after a FAILED authorization so the next attempt
 * gets a fresh idempotency key. Best-effort — a bump failure must not mask the
 * original payment error.
 */
export async function bumpHoldAttempt(
  table: 'rides' | 'hmu_posts',
  column: 'hold_attempt' | 'deposit_attempt',
  id: string,
): Promise<void> {
  try {
    await sql.query(
      `UPDATE ${table} SET ${column} = COALESCE(${column}, 0) + 1 WHERE id = $1`,
      [id],
    );
  } catch { /* column may not exist yet; ignore */ }
}
