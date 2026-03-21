import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      background: '#080808',
      color: '#fff',
      minHeight: '100svh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      fontFamily: "'DM Sans', sans-serif",
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: '96px',
        color: '#00E676',
        lineHeight: 1,
        marginBottom: '8px',
      }}>
        404
      </div>
      <h1 style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: '28px',
        marginBottom: '8px',
      }}>
        Page not found
      </h1>
      <p style={{ fontSize: '14px', color: '#888', marginBottom: '24px' }}>
        This page doesn&apos;t exist or was moved.
      </p>
      <Link
        href="/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '12px 24px',
          borderRadius: '100px',
          border: 'none',
          background: '#00E676',
          color: '#080808',
          fontSize: '14px',
          fontWeight: 700,
          textDecoration: 'none',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        Go Home
      </Link>
    </div>
  );
}
