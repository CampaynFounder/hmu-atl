// POST /api/driver/payout-setup/bank — Add or replace external bank account
// DELETE /api/driver/payout-setup/bank — Remove an external account
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  httpClient: Stripe.createFetchHttpClient(),
});

async function getDriverStripeAccount(clerkId: string) {
  const rows = await sql`
    SELECT dp.stripe_account_id, u.id as user_id
    FROM users u
    JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE u.clerk_id = ${clerkId} LIMIT 1
  `;
  if (!rows.length || !rows[0].stripe_account_id) return null;
  return { stripeAccountId: rows[0].stripe_account_id as string, userId: rows[0].user_id as string };
}

// POST — Add bank account using routing + account number
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const driver = await getDriverStripeAccount(clerkId);
  if (!driver) return NextResponse.json({ error: 'No payout account found' }, { status: 400 });

  const { routingNumber, accountNumber, accountHolderName, accountType } = await req.json();

  if (!routingNumber || !accountNumber || !accountHolderName) {
    return NextResponse.json({ error: 'Routing number, account number, and account holder name required' }, { status: 400 });
  }

  try {
    // Create external account on the connected account
    const account = await stripe.accounts.createExternalAccount(
      driver.stripeAccountId,
      {
        external_account: {
          object: 'bank_account',
          country: 'US',
          currency: 'usd',
          routing_number: routingNumber,
          account_number: accountNumber,
          account_holder_name: accountHolderName,
          account_holder_type: accountType || 'individual',
        },
        default_for_currency: true,
      }
    );

    const bankAccount = account as Stripe.BankAccount;

    // Update DB
    await sql`
      UPDATE driver_profiles
      SET stripe_external_account_last4 = ${bankAccount.last4},
          stripe_external_account_type = 'bank_account',
          stripe_external_account_bank = ${bankAccount.bank_name},
          stripe_instant_eligible = false,
          payout_setup_complete = true,
          payout_method = 'bank'
      WHERE user_id = ${driver.userId}
    `;

    return NextResponse.json({
      success: true,
      account: {
        id: bankAccount.id,
        last4: bankAccount.last4,
        bankName: bankAccount.bank_name,
        type: 'bank_account',
        default: bankAccount.default_for_currency,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to add bank account';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// GET — List current external accounts
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const driver = await getDriverStripeAccount(clerkId);
  if (!driver) return NextResponse.json({ accounts: [] });

  try {
    const list = await stripe.accounts.listExternalAccounts(driver.stripeAccountId, { limit: 10 });

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
  } catch (error) {
    return NextResponse.json({ error: 'Failed to list accounts' }, { status: 500 });
  }
}

// DELETE — Remove an external account
export async function DELETE(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const driver = await getDriverStripeAccount(clerkId);
  if (!driver) return NextResponse.json({ error: 'No payout account found' }, { status: 400 });

  const { accountId } = await req.json();
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

  try {
    await stripe.accounts.deleteExternalAccount(driver.stripeAccountId, accountId);

    // Check remaining accounts and update DB
    const remaining = await stripe.accounts.listExternalAccounts(driver.stripeAccountId, { limit: 1 });
    if (remaining.data.length === 0) {
      await sql`
        UPDATE driver_profiles
        SET stripe_external_account_last4 = null,
            stripe_external_account_type = null,
            stripe_external_account_bank = null,
            stripe_instant_eligible = false,
            payout_setup_complete = false,
            payout_method = null
        WHERE user_id = ${driver.userId}
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to remove account';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
