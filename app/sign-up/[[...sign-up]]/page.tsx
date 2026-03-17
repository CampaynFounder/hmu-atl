// Sign Up Page (Clerk Hosted UI)
import { SignUp } from '@clerk/nextjs';
import { SignUpTypeStore } from './type-store';

interface Props {
  searchParams: Promise<{ type?: string; returnTo?: string }>;
}

export default async function SignUpPage({ searchParams }: Props) {
  const { type, returnTo } = await searchParams;

  // Build post-signup redirect — preserve returnTo so auth-callback can send
  // the rider back to the driver profile page after onboarding completes.
  const callbackParams = new URLSearchParams();
  if (type) callbackParams.set('type', type);
  if (returnTo && returnTo.startsWith('/d/')) callbackParams.set('returnTo', returnTo);
  const afterSignUpUrl = `/auth-callback${callbackParams.size ? `?${callbackParams}` : ''}`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
      {/* Persist type to localStorage so it survives OAuth full-page redirects */}
      <SignUpTypeStore type={type} returnTo={returnTo} />
      <SignUp
        forceRedirectUrl={afterSignUpUrl}
        fallbackRedirectUrl="/auth-callback"
        signInUrl={type ? `/sign-in?type=${type}` : '/sign-in'}
      />
    </div>
  );
}
