import { NextResponse } from 'next/server';

// WebAuthn Related Origin validation
// Required by Clerk for passkey authentication with custom domains.
// See: https://w3c.github.io/webauthn/#sctn-related-origins
//
// All market subdomains + the root Clerk domain are listed so passkeys work
// cross-market once Clerk moves to clerk.hmucashride.com. Both the old
// clerk.atl.* and the new clerk.* are included during the migration window
// so passkeys keep working for users who authenticated on either.
export async function GET() {
  return NextResponse.json({
    origins: [
      'https://atl.hmucashride.com',
      'https://nola.hmucashride.com',
      'https://clerk.hmucashride.com',
      'https://clerk.atl.hmucashride.com',
    ],
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
