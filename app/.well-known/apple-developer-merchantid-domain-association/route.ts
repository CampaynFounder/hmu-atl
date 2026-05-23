// Apple Pay domain verification file.
// Content comes from Stripe Dashboard → Settings → Payment Methods → Apple Pay
// → registered domain → Download. Paste the full file contents into DOMAIN_ASSOCIATION below.
// See: https://stripe.com/docs/apple-pay#verify-your-domain

const DOMAIN_ASSOCIATION = `PASTE_STRIPE_DOMAIN_ASSOCIATION_FILE_CONTENT_HERE`;

export async function GET() {
  return new Response(DOMAIN_ASSOCIATION, {
    headers: {
      'Content-Type': 'text/plain',
    },
  });
}
