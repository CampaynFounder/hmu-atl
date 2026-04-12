// Clerk Webhook Handler
// Handles user.created, user.updated, user.deleted events
// Creates Stripe Customer + Connect accounts via publicMetadata

import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { createUser, updateUser, deleteUser, getUserByClerkId, resolveDriverHandleToUserId } from '@/lib/db/users';
import { notifyAdminSms } from '@/lib/admin/notify';
import { createCustomer, createConnectAccount } from '@/lib/stripe/client';
import type { ProfileType } from '@/lib/db/types';

// Extract the first verified phone number from a Clerk user payload.
// Returns null if no phone has a verification.status of 'verified'.
function getVerifiedPhone(data: { phone_numbers?: Array<{ phone_number: string; verification?: { status?: string } | null }> }): string | null {
  const numbers = data.phone_numbers || [];
  for (const n of numbers) {
    if (n.verification?.status === 'verified') return n.phone_number;
  }
  return null;
}

// Force dynamic rendering (don't pre-render at build time)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error('CLERK_WEBHOOK_SECRET is not defined');
  }

  // Get headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Missing svix headers', { status: 400 });
  }

  // Get body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Verify webhook signature
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Webhook verification failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  // Handle events
  const eventType = evt.type;

  // user.created: log only. We DELIBERATELY do not create the Neon row here
  // because phone is not yet verified — unverified signups are treated as bots
  // and excluded from admin analytics. Row creation happens on user.updated
  // the first time a verified phone appears.
  if (eventType === 'user.created') {
    console.log('[WEBHOOK] user.created - deferring Neon row until phone verified:', {
      clerkId: evt.data.id,
    });
    return new Response('Deferred until phone verified', { status: 200 });
  }

  if (eventType === 'user.updated') {
    try {
      const data = evt.data;
      const { id, email_addresses, first_name, last_name, public_metadata, unsafe_metadata } = data;

      // Keep existing metadata-driven status sync for already-created users.
      const existing = await getUserByClerkId(id);
      if (existing) {
        const accountStatus = public_metadata?.account_status as string | undefined;
        if (accountStatus && ['pending_activation', 'active', 'suspended', 'banned'].includes(accountStatus)) {
          await updateUser(id, { account_status: accountStatus as any });
        }
        return new Response('User updated', { status: 200 });
      }

      // No Neon row yet — create one only if phone is now verified.
      const verifiedPhone = getVerifiedPhone(data as any);
      if (!verifiedPhone) {
        console.log('[WEBHOOK] user.updated - no verified phone yet, still deferring:', { clerkId: id });
        return new Response('Deferred until phone verified', { status: 200 });
      }

      // Read attribution from unsafeMetadata (set by sign-up page).
      const meta = (unsafe_metadata || {}) as Record<string, unknown>;
      const intentRaw = (meta.intent as string) || (public_metadata?.profile_type as string) || 'rider';
      const profileType = (['rider', 'driver'].includes(intentRaw) ? intentRaw : 'rider') as ProfileType;
      const signupSourceRaw = (meta.signup_source as string) || 'direct';
      const signupSource = (['hmu_chat', 'direct', 'homepage_lead'].includes(signupSourceRaw)
        ? signupSourceRaw
        : 'direct') as 'hmu_chat' | 'direct' | 'homepage_lead';
      const refHandle = (meta.ref_handle as string) || null;

      // Resolve referring driver from handle, if provided.
      let referredByDriverId: string | null = null;
      if (refHandle) {
        referredByDriverId = await resolveDriverHandleToUserId(refHandle);
        if (!referredByDriverId) {
          console.warn('[WEBHOOK] ref_handle did not resolve to a driver:', refHandle);
        }
      }

      const { created } = await createUser({
        clerk_id: id,
        profile_type: profileType,
        signup_source: signupSource,
        referred_by_driver_id: referredByDriverId,
      });

      // Only provision Stripe if THIS invocation won the create-race.
      // If we lost the race (another concurrent webhook or the onboarding fallback
      // created the row first), the winner is responsible for Stripe.
      if (!created) {
        console.log('[WEBHOOK] user.updated - lost race, skipping Stripe provisioning:', { clerkId: id });
        return new Response('User already existed', { status: 200 });
      }

      // Provision Stripe Customer + Connect account now that the user is real.
      const email = email_addresses?.[0]?.email_address || '';
      const name = `${first_name || ''} ${last_name || ''}`.trim() || 'User';

      let stripeCustomerId: string | undefined;
      try {
        stripeCustomerId = await createCustomer({ clerkId: id, email, name });
      } catch (stripeErr) {
        console.error('[WEBHOOK] Stripe customer creation failed:', stripeErr);
      }

      let stripeAccountId: string | undefined;
      if (profileType === 'driver') {
        try {
          stripeAccountId = await createConnectAccount({ clerkId: id, email });
        } catch (stripeErr) {
          console.error('[WEBHOOK] Stripe Connect creation failed:', stripeErr);
        }
      }

      console.log('[WEBHOOK] user.updated - Neon row created after phone verification:', {
        clerkId: id,
        profileType,
        signupSource,
        referredByDriverId,
        stripeCustomerId,
        stripeAccountId,
      });

      // Fire-and-forget admin SMS notification
      const displayName = `${first_name || ''} ${last_name || ''}`.trim() || verifiedPhone;
      const notifType = profileType === 'driver' ? 'new_driver_signup' : 'new_rider_signup';
      const emoji = profileType === 'driver' ? '🚗' : '🧑';
      notifyAdminSms(
        notifType,
        `${emoji} New ${profileType} signup: ${displayName} (${verifiedPhone}) via ${signupSource}`,
        { clerkId: id },
      ).catch(() => {});

      return new Response('User created after phone verification', { status: 201 });
    } catch (error) {
      console.error('[WEBHOOK] user.updated error:', error);
      return new Response('Internal server error', { status: 500 });
    }
  }

  if (eventType === 'user.deleted') {
    try {
      const { id } = evt.data;

      if (!id) {
        return new Response('Missing user ID', { status: 400 });
      }

      // Delete user from Neon (cascade handled by DB constraints)
      const deleted = await deleteUser(id);

      if (!deleted) {
        console.warn('[WEBHOOK] user.deleted - User not found in Neon:', id);
      }

      console.log('[WEBHOOK] user.deleted - User removed from Neon:', id);
      return new Response('User deleted', { status: 200 });
    } catch (error) {
      console.error('[WEBHOOK] user.deleted error:', error);
      return new Response('Internal server error', { status: 500 });
    }
  }

  // Unhandled event type
  console.log('[WEBHOOK] Unhandled event type:', eventType);
  return new Response('Event type not handled', { status: 200 });
}
