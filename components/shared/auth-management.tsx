'use client';

import { useState } from 'react';
import { useUser, useReverification } from '@clerk/nextjs';
import { Key, Phone, Lock, Trash2, Check, AlertTriangle, Eye, EyeOff } from 'lucide-react';

// ── Styles ──
const card = {
  background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px', padding: '20px', marginBottom: '12px',
} as const;
const title = { fontSize: '15px', fontWeight: 700, marginBottom: '4px' } as const;
const sub = { fontSize: '13px', color: '#888', lineHeight: 1.4 } as const;
const greenBtn = {
  marginTop: 10, padding: '10px 20px', borderRadius: 100,
  border: '1px solid rgba(0,230,118,0.3)', background: 'rgba(0,230,118,0.08)',
  color: '#00E676', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
} as const;
const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.12)', background: '#1a1a1a',
  color: '#fff', fontSize: 14, outline: 'none',
  fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
} as const;
const dangerBtn = {
  ...greenBtn,
  border: '1px solid rgba(255,82,82,0.3)', background: 'rgba(255,82,82,0.08)',
  color: '#FF5252',
} as const;

function StatusMsg({ msg, isError }: { msg: string; isError?: boolean }) {
  if (!msg) return null;
  return (
    <div style={{
      fontSize: 13, padding: '8px 12px', borderRadius: 10, marginTop: 8,
      background: isError ? 'rgba(255,68,68,0.08)' : 'rgba(0,230,118,0.08)',
      color: isError ? '#FF5252' : '#00E676',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {isError ? <AlertTriangle style={{ width: 14, height: 14 }} /> : <Check style={{ width: 14, height: 14 }} />}
      {msg}
    </div>
  );
}

// ── Phone Management ──
function PhoneSection() {
  const { user } = useUser();
  const [mode, setMode] = useState<'view' | 'add' | 'verify'>('view');
  const [phoneInput, setPhoneInput] = useState('');
  const [code, setCode] = useState('');
  const [phoneId, setPhoneId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  const currentPhone = user?.primaryPhoneNumber?.phoneNumber;

  async function handleAddPhone() {
    if (!user || !phoneInput.trim()) return;
    setLoading(true);
    setMsg('');
    try {
      const phone = await user.createPhoneNumber({ phoneNumber: phoneInput.trim() });
      await phone.prepareVerification();
      setPhoneId(phone.id);
      setMode('verify');
      setMsg('Verification code sent');
      setIsError(false);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : 'Could not add phone number';
      setMsg(m);
      setIsError(true);
    }
    setLoading(false);
  }

  async function handleVerify() {
    if (!user || !phoneId || !code.trim()) return;
    setLoading(true);
    setMsg('');
    try {
      const phone = user.phoneNumbers.find(p => p.id === phoneId);
      if (!phone) throw new Error('Phone number not found');
      await phone.attemptVerification({ code: code.trim() });
      // Set as primary via user update
      await user.update({ primaryPhoneNumberId: phone.id });
      // Sync to Neon profile
      try {
        await fetch('/api/users/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phoneInput.trim() }),
        });
      } catch { /* non-critical */ }
      await user.reload();
      setMode('view');
      setPhoneInput('');
      setCode('');
      setPhoneId(null);
      setMsg('Phone number updated');
      setIsError(false);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : 'Invalid code';
      setMsg(m);
      setIsError(true);
    }
    setLoading(false);
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Phone style={{ width: 16, height: 16, color: '#00E676' }} />
        <div style={title}>Phone Number</div>
      </div>

      {mode === 'view' && (
        <>
          <div style={sub}>{currentPhone || 'Not set'}</div>
          <button onClick={() => { setMode('add'); setMsg(''); }} style={greenBtn}>
            {currentPhone ? 'Change Phone Number' : 'Add Phone Number'}
          </button>
        </>
      )}

      {mode === 'add' && (
        <div style={{ marginTop: 8 }}>
          <div style={{ ...sub, marginBottom: 8 }}>
            {currentPhone ? 'Enter your new phone number' : 'Add a phone number for sign-in'}
          </div>
          <input
            type="tel"
            placeholder="+1 (555) 123-4567"
            value={phoneInput}
            onChange={e => setPhoneInput(e.target.value)}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={handleAddPhone} disabled={loading || !phoneInput.trim()} style={{
              ...greenBtn, marginTop: 0, opacity: loading || !phoneInput.trim() ? 0.5 : 1,
            }}>
              {loading ? 'Sending...' : 'Send Code'}
            </button>
            <button onClick={() => { setMode('view'); setMsg(''); }} style={{ ...greenBtn, marginTop: 0, color: '#888', borderColor: 'rgba(255,255,255,0.1)', background: 'transparent' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'verify' && (
        <div style={{ marginTop: 8 }}>
          <div style={{ ...sub, marginBottom: 8 }}>
            Enter the 6-digit code sent to {phoneInput}
          </div>
          <input
            type="text"
            inputMode="numeric"
            placeholder="123456"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            style={{ ...inputStyle, letterSpacing: 8, textAlign: 'center', fontSize: 20, fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={handleVerify} disabled={loading || code.length < 6} style={{
              ...greenBtn, marginTop: 0, opacity: loading || code.length < 6 ? 0.5 : 1,
            }}>
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            <button onClick={() => { setMode('view'); setMsg(''); setCode(''); }} style={{ ...greenBtn, marginTop: 0, color: '#888', borderColor: 'rgba(255,255,255,0.1)', background: 'transparent' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <StatusMsg msg={msg} isError={isError} />
    </div>
  );
}

// ── Password Management ──
function PasswordSection() {
  const { user } = useUser();
  const [mode, setMode] = useState<'view' | 'change' | 'set'>('view');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);
  const [removing, setRemoving] = useState(false);

  const hasPassword = user?.passwordEnabled ?? false;
  const hasOtherAuth = (user?.phoneNumbers?.length ?? 0) > 0 || (user?.passkeys?.length ?? 0) > 0;

  async function handleSetOrChange() {
    if (!user) return;
    if (newPw !== confirmPw) {
      setMsg('Passwords do not match');
      setIsError(true);
      return;
    }
    if (newPw.length < 8) {
      setMsg('Password must be at least 8 characters');
      setIsError(true);
      return;
    }
    setLoading(true);
    setMsg('');
    try {
      if (hasPassword) {
        await user.updatePassword({
          currentPassword: currentPw,
          newPassword: newPw,
          signOutOfOtherSessions: false,
        });
      } else {
        await user.updatePassword({
          newPassword: newPw,
          signOutOfOtherSessions: false,
        });
      }
      await user.reload();
      setMode('view');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setMsg(hasPassword ? 'Password updated' : 'Password set');
      setIsError(false);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : 'Could not update password';
      setMsg(m);
      setIsError(true);
    }
    setLoading(false);
  }

  async function handleRemovePassword() {
    if (!hasOtherAuth) {
      setMsg('Add a phone number or passkey before removing your password');
      setIsError(true);
      return;
    }
    setRemoving(true);
    setMsg('');
    try {
      const res = await fetch('/api/users/auth/remove-password', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Could not remove password');
      }
      await user?.reload();
      setMsg('Password removed. You can now sign in with phone or passkey.');
      setIsError(false);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : 'Could not remove password';
      setMsg(m);
      setIsError(true);
    }
    setRemoving(false);
  }

  function PasswordInput({ value, onChange, placeholder, show, onToggle }: {
    value: string; onChange: (v: string) => void; placeholder: string; show: boolean; onToggle: () => void;
  }) {
    return (
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <input
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
        />
        <button
          type="button"
          onClick={onToggle}
          style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: 4,
          }}
        >
          {show ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
        </button>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Lock style={{ width: 16, height: 16, color: '#00E676' }} />
        <div style={title}>Password</div>
      </div>

      {mode === 'view' && (
        <>
          <div style={sub}>
            {hasPassword ? 'Password is set' : 'No password set — using phone or passkey sign-in'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => { setMode(hasPassword ? 'change' : 'set'); setMsg(''); }}
              style={greenBtn}
            >
              {hasPassword ? 'Change Password' : 'Set Password'}
            </button>
            {hasPassword && hasOtherAuth && (
              <button onClick={handleRemovePassword} disabled={removing} style={{
                ...dangerBtn, opacity: removing ? 0.5 : 1,
              }}>
                {removing ? 'Removing...' : 'Remove Password'}
              </button>
            )}
          </div>
          {hasPassword && !hasOtherAuth && (
            <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
              Add a phone number or passkey before you can remove your password
            </div>
          )}
        </>
      )}

      {(mode === 'change' || mode === 'set') && (
        <div style={{ marginTop: 8 }}>
          {hasPassword && (
            <PasswordInput
              value={currentPw} onChange={setCurrentPw}
              placeholder="Current password" show={showCurrent} onToggle={() => setShowCurrent(!showCurrent)}
            />
          )}
          <PasswordInput
            value={newPw} onChange={setNewPw}
            placeholder="New password" show={showNew} onToggle={() => setShowNew(!showNew)}
          />
          <input
            type={showNew ? 'text' : 'password'}
            placeholder="Confirm new password"
            value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={handleSetOrChange}
              disabled={loading || !newPw || !confirmPw || (hasPassword && !currentPw)}
              style={{ ...greenBtn, marginTop: 0, opacity: loading ? 0.5 : 1 }}
            >
              {loading ? 'Saving...' : (hasPassword ? 'Update Password' : 'Set Password')}
            </button>
            <button onClick={() => {
              setMode('view'); setMsg(''); setCurrentPw(''); setNewPw(''); setConfirmPw('');
            }} style={{ ...greenBtn, marginTop: 0, color: '#888', borderColor: 'rgba(255,255,255,0.1)', background: 'transparent' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <StatusMsg msg={msg} isError={isError} />
    </div>
  );
}

// ── Passkey Management ──
function PasskeySection() {
  const { user } = useUser();
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  const createPasskeyReverified = useReverification(() => {
    if (!user) throw new Error('Not signed in');
    return user.createPasskey();
  });

  async function handleAddPasskey() {
    try {
      await createPasskeyReverified();
      await user?.reload();
      setMsg('Passkey added');
      setIsError(false);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : 'Could not create passkey';
      if (!m.includes('canceled') && !m.includes('abort')) {
        setMsg(m);
        setIsError(true);
      }
    }
  }

  async function handleDeletePasskey(passkeyId: string) {
    try {
      const passkey = user?.passkeys?.find(p => p.id === passkeyId);
      if (passkey) {
        await passkey.delete();
        await user?.reload();
        setMsg('Passkey removed');
        setIsError(false);
      }
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : 'Could not remove passkey';
      setMsg(m);
      setIsError(true);
    }
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Key style={{ width: 16, height: 16, color: '#00E676' }} />
        <div style={title}>Passkeys</div>
      </div>

      {user?.passkeys && user.passkeys.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
          {user.passkeys.map(pk => (
            <div key={pk.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#1a1a1a', borderRadius: 12, padding: '10px 14px',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{pk.name || 'Passkey'}</div>
                <div style={{ fontSize: 11, color: '#666' }}>
                  Added {new Date(pk.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
              <button onClick={() => handleDeletePasskey(pk.id)} style={{
                background: 'none', border: 'none', color: '#FF5252', cursor: 'pointer', padding: 6,
              }}>
                <Trash2 style={{ width: 14, height: 14 }} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={sub}>Sign in faster with Face ID, Touch ID, or your device</div>
      )}

      <button onClick={handleAddPasskey} style={greenBtn}>
        {user?.passkeys && user.passkeys.length > 0 ? 'Add Another Passkey' : 'Add Passkey'}
      </button>

      <StatusMsg msg={msg} isError={isError} />
    </div>
  );
}

// ── Auth Status Overview ──
function AuthOverview() {
  const { user } = useUser();
  const hasPhone = (user?.phoneNumbers?.length ?? 0) > 0;
  const hasPassword = user?.passwordEnabled ?? false;
  const hasPasskey = (user?.passkeys?.length ?? 0) > 0;

  const methods = [
    hasPhone && 'Phone',
    hasPassword && 'Password',
    hasPasskey && 'Passkey',
  ].filter(Boolean);

  return (
    <div style={{
      ...card,
      background: 'rgba(0,230,118,0.04)',
      border: '1px solid rgba(0,230,118,0.12)',
    }}>
      <div style={{ fontSize: 12, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
        Active Sign-In Methods
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {methods.length > 0 ? methods.map(m => (
          <span key={String(m)} style={{
            fontSize: 12, fontWeight: 600, color: '#00E676',
            background: 'rgba(0,230,118,0.1)', padding: '4px 12px', borderRadius: 100,
          }}>
            {m}
          </span>
        )) : (
          <span style={{ fontSize: 13, color: '#FF5252' }}>No auth methods configured</span>
        )}
      </div>
      {methods.length === 1 && (
        <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
          Add another sign-in method as a backup
        </div>
      )}
    </div>
  );
}

// ── Main Export ──
export default function AuthManagement() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <AuthOverview />
      <PhoneSection />
      <PasswordSection />
      <PasskeySection />
    </div>
  );
}
