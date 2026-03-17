'use client';

import { Users, Shield, Star } from 'lucide-react';

export interface RiderPreferences {
  riderGenderPref: 'any' | 'women_only' | 'men_only';
  requireOgStatus: boolean;
  minRiderChillScore: number;
  lgbtqFriendly: boolean;
}

interface RiderPreferencesProps {
  preferences: RiderPreferences;
  onChange: (prefs: Partial<RiderPreferences>) => void;
}

const CHILL_PRESETS = [
  { value: 0,  label: 'Any vibe',    sub: 'New riders welcome',      emoji: '👐' },
  { value: 50, label: 'Basic',       sub: 'No major red flags',       emoji: '🙂' },
  { value: 70, label: 'Chill only',  sub: 'Solid track record',       emoji: '✅' },
  { value: 85, label: 'Very Chill',  sub: 'Top tier riders only',     emoji: '😎' },
];

const GENDER_OPTIONS = [
  { value: 'any' as const,         label: 'Any rider',      sub: 'Open to all' },
  { value: 'women_only' as const,  label: 'Women only',     sub: 'Female riders only' },
  { value: 'men_only' as const,    label: 'Men only',       sub: 'Male riders only' },
];

export function RiderPreferencesStep({ preferences, onChange }: RiderPreferencesProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-purple-50 dark:bg-purple-950 p-4 border border-purple-200 dark:border-purple-800">
        <div className="flex gap-3">
          <Shield className="h-5 w-5 shrink-0 text-purple-600 dark:text-purple-400 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Your ride, your rules.</strong>{' '}
            These settings control who can book you directly. You can always decline any request.
          </p>
        </div>
      </div>

      {/* Minimum Chill Score */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold mb-3">
          <Star className="h-4 w-4 text-emerald-500" />
          Minimum Rider Chill Score
        </label>
        <div className="grid grid-cols-2 gap-2">
          {CHILL_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onChange({ minRiderChillScore: preset.value })}
              className={`rounded-xl border-2 p-3 text-left transition-all hover:border-purple-500 ${
                preferences.minRiderChillScore === preset.value
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-950'
                  : 'border-gray-200 dark:border-zinc-700'
              }`}
            >
              <div className="text-xl mb-1">{preset.emoji}</div>
              <div className="text-sm font-bold">{preset.label}</div>
              <div className="text-xs text-muted-foreground">{preset.sub}</div>
              {preset.value > 0 && (
                <div className="text-xs font-mono text-purple-600 dark:text-purple-400 mt-1">{preset.value}%+</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Rider Gender Preference */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold mb-3">
          <Users className="h-4 w-4" />
          Rider Gender Preference
        </label>
        <div className="space-y-2">
          {GENDER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ riderGenderPref: opt.value })}
              className={`w-full rounded-xl border-2 px-4 py-3 text-left transition-all hover:border-purple-500 ${
                preferences.riderGenderPref === opt.value
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-950'
                  : 'border-gray-200 dark:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center ${
                  preferences.riderGenderPref === opt.value
                    ? 'border-purple-500 bg-purple-500'
                    : 'border-gray-300 dark:border-zinc-600'
                }`}>
                  {preferences.riderGenderPref === opt.value && (
                    <div className="h-2 w-2 rounded-full bg-white" />
                  )}
                </div>
                <div>
                  <div className="font-medium text-sm">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.sub}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* OG Riders Only */}
      <label className="flex items-start gap-3 cursor-pointer rounded-xl border-2 p-4 transition-all hover:border-purple-500 dark:border-zinc-700">
        <input
          type="checkbox"
          checked={preferences.requireOgStatus}
          onChange={(e) => onChange({ requireOgStatus: e.target.checked })}
          className="mt-0.5 h-5 w-5 rounded border-gray-300 text-purple-600 focus:ring-2 focus:ring-purple-500/20"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">OG Riders only</span>
            <span className="rounded-full bg-emerald-100 dark:bg-emerald-900 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              10+ rides
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Only riders with 10+ completed rides and zero open disputes can book you directly.
          </p>
        </div>
      </label>

      {/* LGBTQ+ Friendly */}
      <label className="flex items-start gap-3 cursor-pointer rounded-xl border-2 border-purple-300 dark:border-purple-700 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950 p-4">
        <input
          type="checkbox"
          checked={preferences.lgbtqFriendly}
          onChange={(e) => onChange({ lgbtqFriendly: e.target.checked })}
          className="mt-0.5 h-5 w-5 rounded border-gray-300 text-purple-600 focus:ring-2 focus:ring-purple-500/20"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">I&apos;m LGBTQ+ friendly</span>
            <span className="text-lg">🏳️‍🌈</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Show this badge on your profile. Riders filtering for LGBTQ+ friendly drivers will find you.
          </p>
        </div>
      </label>
    </div>
  );
}
