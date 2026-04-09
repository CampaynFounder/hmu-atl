import { NextResponse } from 'next/server';

// WebAuthn Related Origin validation
// Required by Clerk for passkey authentication with custom domains.
// See: https://w3c.github.io/webauthn/#sctn-related-origins
export async function GET() {
  return NextResponse.json({
    origins: [
      'https://atl.hmucashride.com',
      'https://clerk.atl.hmucashride.com',
    ],
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
