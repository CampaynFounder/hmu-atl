// Sign Up Page — type-aware branding for riders vs drivers
import { SignUp } from '@clerk/nextjs';
import { SignUpTypeStore } from './type-store';

interface Props {
  searchParams: Promise<{ type?: string; returnTo?: string }>;
}

export default async function SignUpPage({ searchParams }: Props) {
  const { type, returnTo } = await searchParams;

  const callbackParams = new URLSearchParams();
  if (type) callbackParams.set('type', type);
  if (returnTo && returnTo.startsWith('/d/')) callbackParams.set('returnTo', returnTo);
  const afterSignUpUrl = `/auth-callback${callbackParams.size ? `?${callbackParams}` : ''}`;

  const isDriver = type === 'driver';
  const isRider = type === 'rider';

  return (
    <div style={{
      minHeight: '100svh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#080808',
      padding: '60px 20px 20px',
    }}>
      <SignUpTypeStore type={type} returnTo={returnTo} />

      {/* Type-aware header */}
      <div style={{ textAlign: 'center', marginBottom: '24px', maxWidth: '340px' }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: '28px',
          color: '#fff',
          letterSpacing: '1px',
          lineHeight: 1.1,
          marginBottom: '8px',
        }}>
          {isDriver ? 'VERIFY PAYMENTS BEFORE YOU PULL UP' : isRider ? 'GET A RIDE WITH HMU' : 'JOIN HMU ATL'}
        </div>
        <div style={{
          fontSize: '14px',
          color: '#888',
          lineHeight: 1.4,
        }}>
          {isDriver
            ? 'You Drive. Set Price. We Verify. SAME DAY PAY.'
            : isRider
            ? 'Sign up to ride. Skip the surge, book local drivers at your price.'
            : 'Create your account to get started.'}
        </div>
        {(isDriver || isRider) && (
          <div style={{
            display: 'inline-block',
            marginTop: '12px',
            padding: '4px 14px',
            borderRadius: '100px',
            background: isDriver ? 'rgba(0,230,118,0.12)' : 'rgba(68,138,255,0.12)',
            color: isDriver ? '#00E676' : '#448AFF',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}>
            {isDriver ? 'Driver Sign Up' : 'Rider Sign Up'}
          </div>
        )}
      </div>

      <SignUp
        forceRedirectUrl={afterSignUpUrl}
        fallbackRedirectUrl="/auth-callback"
        signInUrl={type ? `/sign-in?type=${type}` : '/sign-in'}
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
  );
}
