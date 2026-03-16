'use client';

import { useState } from 'react';
import { User, Users } from 'lucide-react';

interface WelcomeProps {
  onNext: () => void;
  data: {
    firstName: string;
    lastName: string;
    gender: string;
    pronouns: string;
    lgbtqFriendly: boolean;
  };
  onChange: (data: Partial<WelcomeProps['data']>) => void;
}

export function Welcome({ onNext, data, onChange }: WelcomeProps) {
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
      {/* Name */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            First Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={data.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
            placeholder="Sarah"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-lg focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-900"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Last Name <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={data.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
            placeholder="Johnson"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-lg focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Only your first initial will be shown to drivers
          </p>
        </div>
      </div>

      {/* Gender */}
      <div>
        <label className="block text-sm font-medium mb-3">
          Gender <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {genderOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => onChange({ gender: option.value })}
              className={`flex items-center gap-3 rounded-xl border-2 px-4 py-4 transition-all hover:border-purple-500 ${
                data.gender === option.value
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-950'
                  : 'border-gray-300 dark:border-zinc-700'
              }`}
            >
              <span className="text-2xl">{option.icon}</span>
              <span className="font-medium">{option.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          This helps match you with drivers you feel comfortable with
        </p>
      </div>

      {/* Pronouns */}
      <div>
        <label className="block text-sm font-medium mb-3">
          Pronouns <span className="text-gray-400">(optional)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {pronounOptions.map((pronoun) => (
            <button
              key={pronoun}
              onClick={() => onChange({ pronouns: pronoun })}
              className={`rounded-full border-2 px-4 py-2 text-sm transition-all hover:border-purple-500 ${
                data.pronouns === pronoun
                  ? 'border-purple-500 bg-purple-50 font-medium dark:bg-purple-950'
                  : 'border-gray-300 dark:border-zinc-700'
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
            className="mt-3 w-full rounded-xl border border-gray-300 px-4 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-900"
          />
        )}
      </div>

      {/* LGBTQ+ Friendly */}
      <div className="rounded-xl border-2 border-dashed border-purple-300 bg-gradient-to-br from-purple-50 to-pink-50 p-6 dark:border-purple-700 dark:from-purple-950 dark:to-pink-950">
        <label className="flex items-start gap-4 cursor-pointer">
          <input
            type="checkbox"
            checked={data.lgbtqFriendly}
            onChange={(e) => onChange({ lgbtqFriendly: e.target.checked })}
            className="mt-1 h-5 w-5 rounded border-gray-300 text-purple-600 focus:ring-2 focus:ring-purple-500/20"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">I'm LGBTQ+ friendly</span>
              <span className="text-xl">🏳️‍🌈</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Show this badge on your profile and connect with drivers who value
              inclusivity
            </p>
          </div>
        </label>
      </div>

      {/* Why we ask */}
      <div className="rounded-xl bg-gray-100 p-4 dark:bg-zinc-800">
        <div className="flex gap-3">
          <Users className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <strong className="text-foreground">Why we ask:</strong> This information
            helps us match you with drivers you'll feel comfortable with. Your
            safety and comfort are our top priority.
          </div>
        </div>
      </div>
    </div>
  );
}
