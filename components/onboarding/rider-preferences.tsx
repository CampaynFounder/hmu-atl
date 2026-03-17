'use client';

import { Users, Shield, Star, AlertTriangle } from 'lucide-react';

export interface RiderPreferences {
  riderGenderPref: 'any' | 'women_only' | 'men_only';
  requireOgStatus: boolean;
  minRiderChillScore: number;
  lgbtqFriendly: boolean;
  avoidRidersWithDisputes: boolean;
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
  { value: 'any' as const,         label: 'Show me all riders',  sub: 'Open to anyone' },
  { value: 'women_only' as const,  label: 'Women only',          sub: 'Female riders only' },
  { value: 'men_only' as const,    label: 'Men only',            sub: 'Male riders only' },
];

export function RiderPreferencesStep({ preferences, onChange }: RiderPreferencesProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-[#00E676]/10 p-4 border border-[#00E676]/30">
        <div className="flex gap-3">
          <Shield className="h-5 w-5 shrink-0 text-[#00E676] mt-0.5" />
          <p className="text-sm text-zinc-300">
            <strong className="text-white">Your ride, your rules.</strong>{' '}
            These settings control which riders can book you. You can always decline any request.
          </p>
        </div>
      </div>

      {/* Rider Gender Preference */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold mb-3 text-white">
          <Users className="h-4 w-4 text-[#00E676]" />
          Rider Gender Preference
        </label>
        <div className="space-y-2">
          {GENDER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ riderGenderPref: opt.value })}
              className={`w-full rounded-xl border-2 px-4 py-3 text-left transition-all ${
                preferences.riderGenderPref === opt.value
                  ? 'border-[#00E676] bg-[#00E676]/10'
                  : 'border-zinc-700 hover:border-zinc-500'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center ${
                  preferences.riderGenderPref === opt.value
                    ? 'border-[#00E676] bg-[#00E676]'
                    : 'border-zinc-600'
                }`}>
                  {preferences.riderGenderPref === opt.value && (
                    <div className="h-2 w-2 rounded-full bg-black" />
                  )}
                </div>
                <div>
                  <div className="font-medium text-sm text-white">{opt.label}</div>
                  <div className="text-xs text-zinc-400">{opt.sub}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Minimum Rider Chill Score */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold mb-3 text-white">
          <Star className="h-4 w-4 text-[#00E676]" />
          Minimum Rider Chill Score
        </label>
        <div className="grid grid-cols-2 gap-2">
          {CHILL_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onChange({ minRiderChillScore: preset.value })}
              className={`rounded-xl border-2 p-3 text-left transition-all ${
                preferences.minRiderChillScore === preset.value
                  ? 'border-[#00E676] bg-[#00E676]/10'
                  : 'border-zinc-700 hover:border-zinc-500'
              }`}
            >
              <div className="text-xl mb-1">{preset.emoji}</div>
              <div className="text-sm font-bold text-white">{preset.label}</div>
              <div className="text-xs text-zinc-400">{preset.sub}</div>
              {preset.value > 0 && (
                <div className="text-xs font-mono text-[#00E676] mt-1">{preset.value}%+</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Additional Rider Filters */}
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-white mb-2">Rider Filters</label>

        {/* OG Riders Only */}
        <label className="flex items-start gap-3 cursor-pointer rounded-xl border-2 border-zinc-700 p-4 transition-all hover:border-zinc-500">
          <input
            type="checkbox"
            checked={preferences.requireOgStatus}
            onChange={(e) => onChange({ requireOgStatus: e.target.checked })}
            className="mt-0.5 h-5 w-5 rounded border-zinc-600 accent-[#00E676]"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-white">OG Riders only</span>
              <span className="rounded-full bg-[#00E676]/20 px-2 py-0.5 text-xs font-bold text-[#00E676]">
                10+ rides
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Only riders with 10+ completed rides and zero open disputes can book you directly.
            </p>
          </div>
        </label>

        {/* Avoid Riders with Disputes */}
        <label className="flex items-start gap-3 cursor-pointer rounded-xl border-2 border-zinc-700 p-4 transition-all hover:border-zinc-500">
          <input
            type="checkbox"
            checked={preferences.avoidRidersWithDisputes}
            onChange={(e) => onChange({ avoidRidersWithDisputes: e.target.checked })}
            className="mt-0.5 h-5 w-5 rounded border-zinc-600 accent-[#00E676]"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-400" />
              <span className="font-semibold text-sm text-white">Avoid riders with disputes</span>
              <span className="ml-auto rounded-full bg-green-900/50 px-2 py-0.5 text-xs font-medium text-green-400">
                Recommended
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Hide riders who currently have unresolved safety or conduct disputes.
            </p>
          </div>
        </label>

        {/* LGBTQ+ Friendly */}
        <label className="flex items-start gap-3 cursor-pointer rounded-xl border-2 border-purple-700/60 bg-gradient-to-br from-purple-950/40 to-pink-950/40 p-4">
          <input
            type="checkbox"
            checked={preferences.lgbtqFriendly}
            onChange={(e) => onChange({ lgbtqFriendly: e.target.checked })}
            className="mt-0.5 h-5 w-5 rounded border-zinc-600 accent-[#00E676]"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-white">I&apos;m LGBTQ+ friendly</span>
              <span className="text-lg">🏳️‍🌈</span>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Show this badge on your profile. Riders filtering for LGBTQ+ friendly drivers will find you.
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
