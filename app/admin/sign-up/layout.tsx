// Minimal layout for admin sign-up — bypasses the admin layout's requireAdmin() gate
export default function AdminSignUpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100svh',
      background: '#080808',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {children}
    </div>
  );
}
