// Clerk Webhook Handler
// Handles user.created, user.updated, user.deleted events
// Creates Stripe Customer + Connect accounts via publicMetadata

import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { createUser, updateUser, deleteUser, getUserByClerkId } from '@/lib/db/users';
import { createCustomer, createConnectAccount } from '@/lib/stripe/client';
import type { ProfileType } from '@/lib/db/types';

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

  if (eventType === 'user.created') {
    try {
      const { id, email_addresses, first_name, last_name, public_metadata } = evt.data;

      // Extract profile_type from publicMetadata (set during sign-up)
      // Default to 'rider' if not provided (for testing - proper flow will require this)
      let profileType = public_metadata?.profile_type as ProfileType;
      const videoIntroUrl = public_metadata?.video_intro_url as string | undefined;

      if (!profileType || !['rider', 'driver', 'both'].includes(profileType)) {
        console.warn('Missing profile_type in publicMetadata, defaulting to "rider":', public_metadata);
        profileType = 'rider'; // Default for testing
      }

      // Create user in Neon with pending_activation status
      await createUser({
        clerk_id: id,
        profile_type: profileType,
        video_intro_url: videoIntroUrl,
      });

      // Create Stripe Customer for ALL users
      const email = email_addresses[0]?.email_address || '';
      const name = `${first_name || ''} ${last_name || ''}`.trim() || 'User';

      const stripeCustomerId = await createCustomer({
        clerkId: id,
        email,
        name,
      });

      // Create Stripe Connect account for drivers only
      let stripeAccountId: string | undefined;
      if (profileType === 'driver' || profileType === 'both') {
        stripeAccountId = await createConnectAccount({
          clerkId: id,
          email,
        });
      }

      // Update Clerk publicMetadata with Stripe IDs
      // NOTE: In production, you'd use the Clerk Backend SDK to update metadata
      // For now, we log and rely on the client to sync this data
      console.log('[WEBHOOK] user.created - Stripe IDs generated:', {
        clerkId: id,
        stripeCustomerId,
        stripeAccountId,
      });

      // TODO: Use Clerk Backend API to update publicMetadata:
      // await clerkClient.users.updateUserMetadata(id, {
      //   publicMetadata: { stripeCustomerId, stripeAccountId }
      // });

      return new Response('User created', { status: 201 });
    } catch (error) {
      console.error('[WEBHOOK] user.created error:', error);
      return new Response('Internal server error', { status: 500 });
    }
  }

  if (eventType === 'user.updated') {
    try {
      const { id, public_metadata } = evt.data;

      // Sync any metadata changes to Neon if needed
      const user = await getUserByClerkId(id);
      if (!user) {
        console.warn('[WEBHOOK] user.updated - User not found in Neon:', id);
        return new Response('User not found', { status: 404 });
      }

      // Example: If account_status changed in publicMetadata, sync it
      const accountStatus = public_metadata?.account_status as string | undefined;
      if (accountStatus && ['pending_activation', 'active', 'suspended', 'banned'].includes(accountStatus)) {
        await updateUser(id, { account_status: accountStatus as any });
      }

      console.log('[WEBHOOK] user.updated - Synced metadata:', { clerkId: id });
      return new Response('User updated', { status: 200 });
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
