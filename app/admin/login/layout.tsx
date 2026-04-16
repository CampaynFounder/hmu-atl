// Minimal layout for admin login — bypasses the admin layout's requireAdmin() gate
export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
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
