// Sign In Page — type-aware branding for riders vs drivers
import { SignIn } from '@clerk/nextjs';
import { SignUpTypeStore } from '../../sign-up/[[...sign-up]]/type-store';
import { InAppBrowserGate } from '@/components/auth/in-app-browser-gate';

interface Props {
  searchParams: Promise<{ type?: string; returnTo?: string }>;
}

export default async function SignInPage({ searchParams }: Props) {
  const { type, returnTo } = await searchParams;

  const callbackParams = new URLSearchParams();
  if (type) callbackParams.set('type', type);
  if (returnTo && returnTo.startsWith('/d/')) callbackParams.set('returnTo', returnTo);
  const afterSignInUrl = `/auth-callback${callbackParams.size ? `?${callbackParams}` : ''}`;

  const isDriver = type === 'driver';
  const isRider = type === 'rider';

  return (
    <InAppBrowserGate>
    <div style={{
      minHeight: '100svh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#080808',
      padding: '20px',
    }}>
      <SignUpTypeStore type={type} returnTo={returnTo} />

      {/* Type-aware header */}
      {(isDriver || isRider) && (
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            fontSize: '14px',
            color: '#888',
            marginBottom: '8px',
          }}>
            {isDriver ? 'Welcome back, driver' : 'Welcome back, rider'}
          </div>
          <div style={{
            display: 'inline-block',
            padding: '4px 14px',
            borderRadius: '100px',
            background: isDriver ? 'rgba(0,230,118,0.12)' : 'rgba(68,138,255,0.12)',
            color: isDriver ? '#00E676' : '#448AFF',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}>
            {isDriver ? 'Driver Sign In' : 'Rider Sign In'}
          </div>
        </div>
      )}

      <SignIn
        forceRedirectUrl={afterSignInUrl}
        fallbackRedirectUrl="/auth-callback"
        signUpUrl={type ? `/sign-up?type=${type}` : '/sign-up'}
        appearance={{
          variables: {
            colorPrimary: '#00E676',
            colorBackground: '#141414',
            colorText: '#ffffff',
            colorTextSecondary: '#888888',
            colorInputBackground: '#1a1a1a',
            colorInputText: '#ffffff',
            borderRadius: '12px',
          },
          elements: {
            card: { background: '#141414', border: '1px solid rgba(255,255,255,0.08)', boxShadow: 'none' },
            headerTitle: { color: '#ffffff' },
            headerSubtitle: { color: '#bbbbbb' },
            socialButtonsBlockButton: { border: '1px solid rgba(255,255,255,0.1)', background: '#1a1a1a', color: '#fff' },
            formFieldInput: { border: '1px solid rgba(0,230,118,0.3)', background: '#1a1a1a', color: '#fff' },
            formFieldInput__focused: { border: '1px solid #00E676', boxShadow: '0 0 0 1px #00E676' },
            phoneInputBox: { border: '1px solid rgba(0,230,118,0.3)', background: '#1a1a1a' },
            otpCodeFieldInput: { border: '1px solid rgba(0,230,118,0.3)', background: '#1a1a1a', color: '#fff' },
            otpCodeField: { borderBottom: '1px solid rgba(0,230,118,0.3)' },
            formFieldLabel: { color: '#bbbbbb' },
            formFieldAction: { color: '#00E676' },
            formFieldHintText: { color: '#888888' },
            formResendCodeLink: { color: '#00E676' },
            identityPreviewText: { color: '#bbbbbb' },
            identityPreviewEditButton: { color: '#00E676' },
            alternativeMethodsBlockButton: { border: '1px solid rgba(255,255,255,0.15)', color: '#bbbbbb', background: '#1a1a1a' },
            formHeaderTitle: { color: '#ffffff' },
            formHeaderSubtitle: { color: '#bbbbbb' },
            backLink: { color: '#00E676' },
            formButtonPrimary: { background: '#00E676', color: '#080808', fontWeight: 700 },
            footerActionLink: { color: '#00E676' },
            footerActionText: { color: '#888888' },
          },
        }}
      />
    </div>
    </InAppBrowserGate>
  );
}
