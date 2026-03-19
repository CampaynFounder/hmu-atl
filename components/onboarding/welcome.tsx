'use client';

import { useState } from 'react';
import { User, Users } from 'lucide-react';

interface WelcomeProps {
  onNext: () => void;
  userType?: 'rider' | 'driver';
  data: {
    firstName: string;
    lastName: string;
    gender: string;
    pronouns: string;
    lgbtqFriendly: boolean;
  };
  onChange: (data: Partial<WelcomeProps['data']>) => void;
}

export function Welcome({ onNext, userType = 'rider', data, onChange }: WelcomeProps) {
  const otherRole = userType === 'driver' ? 'riders' : 'drivers';
  const genderOptions = [
    { value: 'woman', label: 'Woman', icon: '♀️' },
    { value: 'man', label: 'Man', icon: '♂️' },
    { value: 'non-binary', label: 'Non-binary', icon: '⚧️' },
    { value: 'prefer-not-to-say', label: 'Prefer not to say', icon: '👤' },
  ];

  const pronounOptions = [
    'she/her',
    'he/him',
    'they/them',
    'she/they',
    'he/they',
    'other',
  ];

  return (
    <div className="space-y-6">
      {/* Privacy notice for drivers */}
      {userType === 'driver' && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-4">
          <div className="flex gap-3">
            <span className="text-xl mt-0.5">🔒</span>
            <div className="text-sm text-zinc-400">
              <strong className="text-zinc-200">Your legal name is private.</strong>{' '}
              Used only for identity verification &amp; payouts. You&apos;ll choose a public driver name next.
            </div>
          </div>
        </div>
      )}

      {/* Name */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-white mb-2">
            {userType === 'driver' ? 'Legal First Name' : 'First Name'} <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={data.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
            placeholder="Sarah"
            className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-3 text-lg text-white placeholder:text-zinc-500 focus:border-[#00E676] focus:outline-none focus:ring-2 focus:ring-[#00E676]/20"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-white mb-2">
            {userType === 'driver' ? 'Legal Last Name' : 'Last Name'} <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={data.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
            placeholder="Johnson"
            className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-3 text-lg text-white placeholder:text-zinc-500 focus:border-[#00E676] focus:outline-none focus:ring-2 focus:ring-[#00E676]/20"
          />
          <p className="mt-1 text-xs text-zinc-400">
            Only your first initial will be shown to {otherRole}
          </p>
        </div>
      </div>

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
          This helps match you with {otherRole} you feel comfortable with
        </p>
      </div>

      {/* Pronouns */}
      <div>
        <label className="block text-sm font-semibold text-white mb-3">
          Pronouns <span className="text-zinc-500">(optional)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {pronounOptions.map((pronoun) => (
            <button
              key={pronoun}
              onClick={() => onChange({ pronouns: pronoun })}
              className={`rounded-full border-2 px-4 py-2 text-sm transition-all hover:border-[#00E676] ${
                data.pronouns === pronoun
                  ? 'border-[#00E676] bg-[#00E676]/10 font-medium text-white'
                  : 'border-zinc-600 text-zinc-300'
              }`}
            >
              {pronoun}
            </button>
          ))}
        </div>
        {data.pronouns === 'other' && (
          <input
            type="text"
            placeholder="Enter your pronouns"
            onChange={(e) => onChange({ pronouns: e.target.value })}
            className="mt-3 w-full rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#00E676] focus:outline-none focus:ring-2 focus:ring-[#00E676]/20"
          />
        )}
      </div>

      {/* LGBTQ+ Friendly */}
      <div className="rounded-xl border-2 border-dashed border-purple-600 bg-purple-950/50 p-6">
        <label className="flex items-start gap-4 cursor-pointer">
          <input
            type="checkbox"
            checked={data.lgbtqFriendly}
            onChange={(e) => onChange({ lgbtqFriendly: e.target.checked })}
            className="mt-1 h-5 w-5 rounded border-zinc-600 bg-zinc-900 text-[#00E676] focus:ring-2 focus:ring-[#00E676]/20"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">I&apos;m LGBTQ+ friendly</span>
              <span className="text-xl">🏳️‍🌈</span>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              Show this badge on your profile and connect with {otherRole} who value
              inclusivity
            </p>
          </div>
        </label>
      </div>

      {/* Why we ask */}
      <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-4">
        <div className="flex gap-3">
          <Users className="h-5 w-5 shrink-0 text-zinc-400 mt-0.5" />
          <div className="text-sm text-zinc-400">
            <strong className="text-zinc-200">Why we ask:</strong> This information
            helps us match you with {otherRole} you&apos;ll feel comfortable with. Your
            safety and comfort are our top priority.
          </div>
        </div>
      </div>
    </div>
  );
}
