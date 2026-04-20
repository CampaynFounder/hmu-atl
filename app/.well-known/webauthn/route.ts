import { NextResponse } from 'next/server';

// WebAuthn Related Origin validation
// Required by Clerk for passkey authentication with custom domains.
// See: https://w3c.github.io/webauthn/#sctn-related-origins
//
// Includes all market application subdomains + each market's Clerk custom
// API subdomain (primary is clerk.atl.*, satellites are clerk.<slug>.*). When
// a new market is added, append both its app and Clerk CNAMEs here.
export async function GET() {
  return NextResponse.json({
    origins: [
      'https://atl.hmucashride.com',
      'https://nola.hmucashride.com',
      'https://clerk.atl.hmucashride.com',
      'https://clerk.nola.hmucashride.com',
    ],
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
