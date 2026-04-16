import { SignIn } from '@clerk/nextjs';

export default function AdminLoginPage() {
  return (
    <div style={{ padding: 20, textAlign: 'center' }}>
      <div style={{
        fontFamily: 'var(--font-display, Bebas Neue, sans-serif)',
        fontSize: 28, fontWeight: 700, color: '#fff',
        letterSpacing: 2, marginBottom: 8,
      }}>
        HMU ADMIN
      </div>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 24 }}>
        Sign in to access the admin portal
      </p>
      <SignIn
        forceRedirectUrl="/admin"
        fallbackRedirectUrl="/admin"
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
            formFieldLabel: { color: '#bbbbbb' },
            formFieldAction: { color: '#00E676' },
            formButtonPrimary: { background: '#00E676', color: '#080808', fontWeight: 700 },
            footerActionLink: { color: '#00E676' },
            footerActionText: { color: '#888888' },
          },
        }}
      />
    </div>
  );
}
