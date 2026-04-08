import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    // Must have another auth method before removing password
    const hasPhone = user.phoneNumbers.length > 0;
    const hasExternalAuth = (user.externalAccounts?.length ?? 0) > 0;

    if (!hasPhone && !hasExternalAuth) {
      return NextResponse.json(
        { error: 'Add a phone number or passkey before removing your password' },
        { status: 400 }
      );
    }

    // Remove password by setting it to undefined with skip checks
    await client.users.updateUser(userId, {
      skipPasswordChecks: true,
      password: '',
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to remove password';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
