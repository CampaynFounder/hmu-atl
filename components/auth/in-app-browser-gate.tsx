'use client';

import { useEffect, useState } from 'react';

/**
 * Detects in-app browsers (Facebook, Instagram, TikTok, LinkedIn, etc.)
 * that block Clerk auth flows. Shows a prompt to open in system browser.
 */
export function InAppBrowserGate({ children }: { children: React.ReactNode }) {
  const [isInApp, setIsInApp] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    const inApp =
      /FBAN|FBAV/i.test(ua) ||       // Facebook
      /Instagram/i.test(ua) ||        // Instagram
      /TikTok/i.test(ua) ||           // TikTok
      /Snapchat/i.test(ua) ||         // Snapchat
      /LinkedInApp/i.test(ua) ||      // LinkedIn
      /Twitter/i.test(ua) ||          // Twitter/X
      /Line\//i.test(ua) ||           // Line
      /MicroMessenger/i.test(ua) ||   // WeChat
      // Generic WebView detection
      (/wv\)/.test(ua) && /Android/.test(ua));

    setIsInApp(inApp);
  }, []);

  if (!isInApp) return <>{children}</>;

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  const handleOpenBrowser = () => {
    // Try intent-based open for Android
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isAndroid) {
      window.location.href = `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=https;end`;
      return;
    }

    // iOS: copy URL and instruct user
    handleCopy();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = currentUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div style={{
      minHeight: '100svh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#080808',
      padding: '40px 20px',
      textAlign: 'center',
      fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
    }}>
      {/* Logo */}
      <div style={{
        fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
        fontSize: 32,
        letterSpacing: 2,
        color: '#00E676',
        marginBottom: 32,
      }}>
        HMU ATL
      </div>

      {/* Icon */}
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>

      {/* Message */}
      <div style={{
        fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
        fontSize: 28,
        color: '#fff',
        lineHeight: 1.1,
        marginBottom: 12,
      }}>
        OPEN IN YOUR BROWSER
      </div>

      <div style={{
        fontSize: 15,
        color: '#bbb',
        lineHeight: 1.5,
        maxWidth: 320,
        marginBottom: 28,
      }}>
        This app&apos;s browser blocks secure sign-up / sign-in.
        Tap below to open in Safari or Chrome — takes 2 seconds.
      </div>

      {/* Open in browser button */}
      <button
        onClick={handleOpenBrowser}
        style={{
          width: '100%',
          maxWidth: 320,
          padding: 16,
          borderRadius: 100,
          background: '#00E676',
          color: '#080808',
          border: 'none',
          fontSize: 16,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          marginBottom: 12,
        }}
      >
        Open in Browser
      </button>

      {/* Copy link fallback */}
      <button
        onClick={handleCopy}
        style={{
          width: '100%',
          maxWidth: 320,
          padding: 14,
          borderRadius: 100,
          background: 'transparent',
          color: copied ? '#00E676' : '#888',
          border: '1px solid rgba(255,255,255,0.1)',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          marginBottom: 24,
        }}
      >
        {copied ? 'Link Copied! Paste in your browser ✓' : 'Copy Link Instead'}
      </button>

      {/* How-to steps */}
      <div style={{
        background: '#141414',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '16px 20px',
        maxWidth: 320,
        width: '100%',
        textAlign: 'left',
      }}>
        <div style={{ fontSize: 11, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
          If that doesn&apos;t work
        </div>
        <div style={{ fontSize: 13, color: '#888', lineHeight: 1.6 }}>
          1. Tap the <strong style={{ color: '#bbb' }}>⋯</strong> menu in the top right<br />
          2. Tap <strong style={{ color: '#bbb' }}>&quot;Open in Browser&quot;</strong> or <strong style={{ color: '#bbb' }}>&quot;Open in Safari&quot;</strong><br />
          3. Sign up from there — it&apos;ll work perfectly
        </div>
      </div>
    </div>
  );
}
