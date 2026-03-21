'use client';

import { useState } from 'react';
import { Users, Shield, Star, AlertTriangle, Info, X } from 'lucide-react';

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
  const [showChillInfo, setShowChillInfo] = useState(false);

  return (
    <>
    {/* Chill Score Info Slide-in */}
    {showChillInfo && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
        onClick={() => setShowChillInfo(false)}
      >
        <div
          style={{
            width: '100%', maxWidth: 420, maxHeight: '80vh', overflowY: 'auto',
            background: '#0a0a0a', borderRadius: '24px 24px 0 0',
            padding: '24px 20px 40px',
            animation: 'slideUp 0.3s ease-out',
          }}
          onClick={e => e.stopPropagation()}
        >
          <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>What is a Chill Score?</h3>
            <button onClick={() => setShowChillInfo(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
              <X className="h-5 w-5" />
            </button>
          </div>
          <p style={{ fontSize: 14, color: '#bbb', lineHeight: 1.5, marginBottom: 16 }}>
            Your Chill Score is a percentage based on your ratings.{' '}
            <strong style={{ color: '#fff' }}>CHILL = 1 point. Cool AF = 1.5 points.</strong>{' '}
            Kinda Creepy and WEIRDO don&apos;t add points — they just lower your average.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[
              { score: '90%+', label: 'Top tier', color: '#00E676' },
              { score: '75%+', label: 'Solid', color: '#448AFF' },
              { score: '50%+', label: 'Decent', color: '#FF9100' },
              { score: '<50%', label: 'At risk', color: '#FF5252' },
            ].map(item => (
              <div key={item.score} style={{
                flex: 1, textAlign: 'center', background: '#141414',
                borderRadius: 10, padding: '10px 4px',
              }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: item.color }}>{item.score}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{item.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { emoji: '\u2705', label: 'CHILL', desc: 'Good vibes, smooth ride', color: '#00E676' },
              { emoji: '\uD83D\uDE0E', label: 'Cool AF', desc: 'Great energy — 1.5x weight', color: '#448AFF' },
              { emoji: '\uD83D\uDC40', label: 'Kinda Creepy', desc: 'Something felt off', color: '#FF9100' },
              { emoji: '\uD83D\uDEA9', label: 'WEIRDO', desc: 'Safety concern — triggers review', color: '#FF5252' },
            ].map(r => (
              <div key={r.label} style={{
                display: 'flex', alignItems: 'center', gap: 12, background: '#141414',
                border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px',
              }}>
                <span style={{ fontSize: 22 }}>{r.emoji}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: r.color }}>{r.label}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{r.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}
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
        <div className="flex items-center gap-2 mb-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-white">
            <Star className="h-4 w-4 text-[#00E676]" />
            Minimum Rider Chill Score
          </label>
          <button
            type="button"
            onClick={() => setShowChillInfo(true)}
            className="rounded-full border border-zinc-600 p-1 hover:border-[#00E676] transition-colors"
          >
            <Info className="h-3.5 w-3.5 text-zinc-400" />
          </button>
        </div>
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
    </>
  );
}
