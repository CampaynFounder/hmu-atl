'use client';

import { useState, useEffect, useRef } from 'react';
import { useUser } from '@clerk/nextjs';

interface WelcomeProps {
  onNext: () => void;
  userType?: 'rider' | 'driver';
  data: {
    firstName: string;
    lastName: string;
    displayName: string;
    gender: string;
    pronouns: string;
    lgbtqFriendly: boolean;
    handleAvailable?: boolean;
  };
  onChange: (data: Partial<WelcomeProps['data']>) => void;
}

export function Welcome({ onNext, userType = 'rider', data, onChange }: WelcomeProps) {
  const otherRole = userType === 'driver' ? 'riders' : 'drivers';
  const isDriver = userType === 'driver';
  const { user } = useUser();

  // Pre-fill from Clerk if available and fields are empty
  useEffect(() => {
    if (!user) return;
    const updates: Partial<WelcomeProps['data']> = {};
    if (!data.firstName && user.firstName) updates.firstName = user.firstName;
    if (!data.lastName && user.lastName) updates.lastName = user.lastName;
    if (Object.keys(updates).length > 0) onChange(updates);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const [handleStatus, setHandleStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const checkTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const genderOptions = [
    { value: 'woman', label: 'Woman', icon: '\u2640\uFE0F' },
    { value: 'man', label: 'Man', icon: '\u2642\uFE0F' },
    { value: 'non-binary', label: 'Non-binary', icon: '\u26A7\uFE0F' },
    { value: 'prefer-not-to-say', label: 'Prefer not to say', icon: '\uD83D\uDC64' },
  ];

  const handleFirstNameChange = (val: string) => {
    onChange({ firstName: val });
  };

  // Check handle availability with debounce
  const handleDisplayNameChange = (val: string) => {
    onChange({ displayName: val, handleAvailable: false });
    if (checkTimeout.current) clearTimeout(checkTimeout.current);
    if (!val.trim() || val.trim().length < 2) {
      setHandleStatus('idle');
      return;
    }
    setHandleStatus('checking');
    checkTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/drivers/check-handle?handle=${encodeURIComponent(val)}`);
        const data = await res.json();
        setHandleStatus(data.available ? 'available' : 'taken');
        onChange({ handleAvailable: data.available });
      } catch {
        setHandleStatus('idle');
      }
    }, 500);
  };

  return (
    <div className="space-y-6">
      {/* Privacy notice for drivers */}
      {isDriver && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-4">
          <div className="flex gap-3">
            <span className="text-xl mt-0.5">{'\uD83D\uDD12'}</span>
            <div className="text-sm text-zinc-400">
              <strong className="text-zinc-200">Your govt name is always private.</strong>{' '}
              Riders never see it. The bank needs it to verify deposits and prevent fraud — if it&apos;s not right, they won&apos;t allow payouts.
            </div>
          </div>
        </div>
      )}

      {/* Govt Name */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-white mb-2">
            First Name {isDriver ? '(Government)' : ''} <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={data.firstName}
            onChange={(e) => handleFirstNameChange(e.target.value)}
            placeholder={isDriver ? 'Govt First Name' : 'First Name'}
            className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-3 text-lg text-white placeholder:text-zinc-500 focus:border-[#00E676] focus:outline-none focus:ring-2 focus:ring-[#00E676]/20"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-white mb-2">
            Last Name {isDriver ? '(Government)' : ''} <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={data.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
            placeholder={isDriver ? 'Govt Last Name' : 'Last Name'}
            className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-3 text-lg text-white placeholder:text-zinc-500 focus:border-[#00E676] focus:outline-none focus:ring-2 focus:ring-[#00E676]/20"
          />
        </div>
      </div>

      {/* Handle / Display Name — what riders see */}
      {isDriver && (
        <div>
          <div className="rounded-xl bg-[#00E676]/10 border border-[#00E676]/30 p-3 mb-4">
            <p className="text-sm text-zinc-300">
              <strong className="text-white">{'\u2B07\uFE0F'} This is what riders see.</strong>{' '}
              Your govt name above stays private.
            </p>
          </div>
          <label className="block text-sm font-semibold text-white mb-2">
            Driver Handle <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={data.displayName}
            onChange={(e) => handleDisplayNameChange(e.target.value)}
            placeholder="YungJoc, Suki, Obama"
            className={`w-full rounded-xl bg-zinc-900 px-4 py-3 text-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#00E676]/20 border ${
              handleStatus === 'taken' ? 'border-red-500' :
              handleStatus === 'available' ? 'border-[#00E676]' :
              'border-[#00E676]/40'
            }`}
          />
          {/* Handle availability status */}
          <div className="mt-1 flex items-center gap-2">
            {handleStatus === 'checking' && (
              <span className="text-xs text-zinc-500">Checking availability...</span>
            )}
            {handleStatus === 'available' && (
              <span className="text-xs text-[#00E676] font-semibold">{'\u2713'} @{data.displayName.toLowerCase().replace(/\s+/g, '')} is available</span>
            )}
            {handleStatus === 'taken' && (
              <span className="text-xs text-red-400 font-semibold">{'\u2717'} That handle is taken — try another</span>
            )}
            {handleStatus === 'idle' && data.displayName.length > 0 && data.displayName.length < 2 && (
              <span className="text-xs text-zinc-500">Handle must be at least 2 characters</span>
            )}
          </div>

          {data.displayName && handleStatus !== 'taken' && data.displayName.length >= 2 && (
            <div className="mt-3 rounded-xl bg-zinc-800 border border-zinc-700 p-4 text-center">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Your HMU link</p>
              <p className="text-sm font-mono text-[#00E676]">
                atl.hmucashride.com/d/{data.displayName.toLowerCase().replace(/\s+/g, '')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Gender */}
      <div>
        <label className="block text-sm font-semibold text-white mb-3">
          Gender <span className="text-red-400">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {genderOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => onChange({ gender: option.value })}
              className={`flex items-center gap-3 rounded-xl border-2 px-4 py-4 transition-all hover:border-[#00E676] ${
                data.gender === option.value
                  ? 'border-[#00E676] bg-[#00E676]/10 text-white'
                  : 'border-zinc-600 text-zinc-300'
              }`}
            >
              <span className="text-2xl">{option.icon}</span>
              <span className="font-medium">{option.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Helps match you with {otherRole} you feel comfortable with
        </p>
      </div>
    </div>
  );
}
