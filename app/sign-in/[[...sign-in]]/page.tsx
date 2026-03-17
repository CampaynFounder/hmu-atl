// Sign In Page (Clerk Hosted UI)
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
      <SignIn
        fallbackRedirectUrl="/auth-callback"
        signUpUrl="/sign-up"
      />
    </div>
  );
}
