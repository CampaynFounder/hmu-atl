// Phone-number normalization for Clerk auth. Clerk's phone_code strategy
// requires an E.164 identifier (e.g. "+14045550000"); a raw "404 555 0000" or
// "(404) 555-0000" without a country code makes signIn/signUp.create throw
// "is not a valid phone number". We're a US market (ATL/NOLA), so when the user
// omits the country code we assume +1. Explicit "+<cc>" input is preserved.
//
// Normalize at SUBMIT time (not on every keystroke) so the user's cursor and
// formatting aren't disturbed while typing.
export function normalizePhoneE164(input: string): string {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return '';

  // Already has an explicit country code — keep it, just strip formatting.
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    return digits ? `+${digits}` : '';
  }

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  // "1XXXXXXXXXX" — US number that already includes the country code.
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

  // Bare 10-digit US local number → assume +1.
  if (digits.length === 10) return `+1${digits}`;

  // Anything else without a "+": assume the US country code. If it's still not
  // a valid number, Clerk returns a clear error the user can act on.
  return `+1${digits}`;
}
