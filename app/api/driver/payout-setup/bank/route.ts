// GET /api/driver/payout-setup/bank — List current external accounts on the connected account
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  httpClient: Stripe.createFetchHttpClient(),
});

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await sql`
    SELECT dp.stripe_account_id
    FROM users u
    JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE u.clerk_id = ${clerkId} LIMIT 1
  `;

  if (!rows.length || !rows[0].stripe_account_id) {
    return NextResponse.json({ accounts: [] });
  }

  try {
    const list = await stripe.accounts.listExternalAccounts(
      rows[0].stripe_account_id as string,
      { limit: 10 }
    );

    const accounts = list.data.map((acct) => {
      if (acct.object === 'bank_account') {
        const bank = acct as Stripe.BankAccount;
        return {
          id: bank.id,
          type: 'bank_account',
          last4: bank.last4,
          bankName: bank.bank_name,
          isDefault: bank.default_for_currency,
          status: bank.status,
        };
      } else {
        const card = acct as Stripe.Card;
        return {
          id: card.id,
          type: 'card',
          last4: card.last4,
          brand: card.brand,
          isDefault: card.default_for_currency,
        };
      }
    });

    return NextResponse.json({ accounts });
  } catch {
    return NextResponse.json({ accounts: [] });
  }
}
