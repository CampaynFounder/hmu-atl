// Sign In Page (Clerk Hosted UI)
import { SignIn } from '@clerk/nextjs';

interface Props {
  searchParams: Promise<{ type?: string; returnTo?: string }>;
}

export default async function SignInPage({ searchParams }: Props) {
  const { type, returnTo } = await searchParams;

  // Preserve type and returnTo through sign-in so auth-callback has context
  // (mirrors the same pattern used by sign-up/page.tsx)
  const callbackParams = new URLSearchParams();
  if (type) callbackParams.set('type', type);
  if (returnTo && returnTo.startsWith('/d/')) callbackParams.set('returnTo', returnTo);
  const afterSignInUrl = `/auth-callback${callbackParams.size ? `?${callbackParams}` : ''}`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
      <SignIn
        forceRedirectUrl={afterSignInUrl}
        fallbackRedirectUrl="/auth-callback"
        signUpUrl={type ? `/sign-up?type=${type}` : '/sign-up'}
      />
    </div>
  );
}
