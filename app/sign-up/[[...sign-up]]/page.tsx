// Sign Up Page — type-aware branding for riders vs drivers
import { headers } from 'next/headers';
import { SignUp } from '@clerk/nextjs';
import { SignUpTypeStore } from './type-store';
import { InAppBrowserGate } from '@/components/auth/in-app-browser-gate';
import { MARKET_SLUG_HEADER, DEFAULT_MARKET_SLUG } from '@/lib/markets/resolver';
import { getMarketBranding } from '@/lib/markets/branding';

interface Props {
  searchParams: Promise<{ type?: string; returnTo?: string; cash?: string; persona?: string; funnel_stage?: string; mode?: string }>;
}

export default async function SignUpPage({ searchParams }: Props) {
  const [{ type, returnTo, cash, persona, funnel_stage, mode }, h] = await Promise.all([
    searchParams,
    headers(),
  ]);
  const marketSlug = h.get(MARKET_SLUG_HEADER) || DEFAULT_MARKET_SLUG;
  const brand = getMarketBranding(marketSlug);

  const callbackParams = new URLSearchParams();
  if (type) callbackParams.set('type', type);
  if (returnTo && returnTo.startsWith('/d/')) callbackParams.set('returnTo', returnTo);
  if (mode === 'express') callbackParams.set('mode', 'express');
  const afterSignUpUrl = `/auth-callback${callbackParams.size ? `?${callbackParams}` : ''}`;

  const isDriver = type === 'driver';
  const isRider = type === 'rider';
  // Express driver path comes from /driver/express. Same Clerk widget,
  // different framing — leans on rider safety as the recruitment hook
  // instead of the standard "make more $$$" earnings pitch.
  const isExpressDriver = isDriver && mode === 'express';

  // Extract driver handle from returnTo (/d/<handle>[/?#...]) for attribution.
  // signup_source = 'hmu_chat' only when the user came via a driver's share profile.
  const refHandle = returnTo && returnTo.startsWith('/d/')
    ? returnTo.slice(3).split(/[/?#]/)[0] || null
    : null;
  const signupSource = refHandle ? 'hmu_chat' : 'direct';

  // unsafeMetadata is persisted on the Clerk user at sign_up.create time and
  // is readable from the webhook payload as `evt.data.unsafe_metadata`. This is
  // the only mechanism that survives the OAuth round-trip (URL params do not).
  const unsafeMetadata: Record<string, string> = {
    intent: type || 'rider',
    signup_source: signupSource,
    market: marketSlug,
  };
  if (refHandle) unsafeMetadata.ref_handle = refHandle;
  if (persona) unsafeMetadata.persona = persona;
  if (funnel_stage) unsafeMetadata.funnel_stage = funnel_stage;
  if (mode === 'express') unsafeMetadata.onboardingMode = 'express';

  return (
    <InAppBrowserGate>
    <div style={{
      minHeight: '100svh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#080808',
      padding: '60px 20px 20px',
    }}>
      <SignUpTypeStore type={type} returnTo={returnTo} cash={cash} mode={mode} />

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
          {isExpressDriver
            ? 'CASH RIDES NEED DRIVERS.'
            : isDriver
            ? 'MAKE MORE DOING RIDES.'
            : isRider
            ? 'GET A RIDE WITH HMU'
            : `JOIN HMU ${brand.cityShort}`}
        </div>
        <div style={{
          fontSize: '14px',
          color: '#888',
          lineHeight: 1.4,
        }}>
          {isExpressDriver
            ? 'Cash rides can be dangerous. HMU for safer rides, secure deposits, same-day pay.'
            : isDriver
            ? 'Keep More $$$. Upfront Payments. No Blank Trips. No Goofy Ish.'
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

      {/* Legal consent */}
      <div style={{
        maxWidth: '340px', textAlign: 'center', marginBottom: '16px',
        fontSize: '11px', color: '#666', lineHeight: 1.5,
      }}>
        By signing up, you agree to our{' '}
        <a href="/terms" style={{ color: '#00E676', textDecoration: 'none' }}>Terms of Service</a>
        {' '}and{' '}
        <a href="/privacy" style={{ color: '#00E676', textDecoration: 'none' }}>Privacy Policy</a>
        , and consent to receive transactional SMS and email messages. Marketing messages require separate opt-in. Reply STOP to cancel SMS at any time. Msg &amp; data rates may apply.
      </div>

      <SignUp
        forceRedirectUrl={afterSignUpUrl}
        fallbackRedirectUrl="/auth-callback"
        // Carry returnTo into the cross-link so users flipping to Sign In via
        // Clerk's in-form link don't lose their driver-page redirect target.
        // SignUpTypeStore also stashes it in localStorage as a backup.
        signInUrl={(() => {
          const p = new URLSearchParams();
          if (type) p.set('type', type);
          if (returnTo) p.set('returnTo', returnTo);
          return `/sign-in${p.size ? `?${p}` : ''}`;
        })()}
        unsafeMetadata={unsafeMetadata}
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
            alternativeMethodsBlockButtonIcon: { color: '#00E676' },
            passkeyIcon: { color: '#00E676', filter: 'brightness(1.5)' },
            buttonArrowIcon: { color: '#00E676' },
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
