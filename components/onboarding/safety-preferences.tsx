'use client';

import { Shield, Users, Star, CheckCircle2, AlertTriangle } from 'lucide-react';

type GenderPreference = 'no_preference' | 'women_only' | 'men_only' | 'prefer_women' | 'prefer_men';

interface SafetyPreferencesProps {
  preferences: {
    driverGenderPref: GenderPreference;
    requireLgbtqFriendly: boolean;
    minDriverRating: number;
    requireVerification: boolean;
    avoidDisputes: boolean;
  };
  onChange: (prefs: Partial<SafetyPreferencesProps['preferences']>) => void;
}

export function SafetyPreferences({ preferences, onChange }: SafetyPreferencesProps) {
  const genderPrefOptions: Array<{ value: GenderPreference; label: string; description: string }> = [
    {
      value: 'no_preference',
      label: 'No preference',
      description: 'Show me all drivers',
    },
    {
      value: 'women_only',
      label: 'Women only',
      description: 'Only match with women drivers',
    },
    {
      value: 'men_only',
      label: 'Men only',
      description: 'Only match with men drivers',
    },
    {
      value: 'prefer_women',
      label: 'Prefer women',
      description: 'Prioritize women but show all',
    },
    {
      value: 'prefer_men',
      label: 'Prefer men',
      description: 'Prioritize men but show all',
    },
  ];

  const ratingLabels = [
    { value: 4.0, label: '4.0+', description: 'Good drivers' },
    { value: 4.5, label: '4.5+', description: 'Great drivers' },
    { value: 4.8, label: '4.8+', description: 'Excellent drivers' },
    { value: 4.9, label: '4.9+', description: 'Top rated only' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Explanation */}
      <div className="rounded-xl bg-purple-50 p-4 dark:bg-purple-950">
        <div className="flex gap-3">
          <Shield className="h-5 w-5 shrink-0 text-purple-600 dark:text-purple-400 mt-0.5" />
          <div className="text-sm">
            <strong className="text-foreground">Your safety, your choice</strong>
            <p className="mt-1 text-muted-foreground">
              These preferences help us match you with drivers you'll feel comfortable with. You
              can change these anytime in Settings.
            </p>
          </div>
        </div>
      </div>

      {/* Driver Gender Preference */}
      <div>
        <label className="block text-sm font-medium mb-3">
          <Users className="inline h-4 w-4 mr-1" />
          Driver Gender Preference
        </label>
        <div className="space-y-2">
          {genderPrefOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => onChange({ driverGenderPref: option.value })}
              className={`w-full rounded-xl border-2 px-4 py-3 text-left transition-all hover:border-purple-500 ${
                preferences.driverGenderPref === option.value
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-950'
                  : 'border-gray-300 dark:border-zinc-700'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center ${
                    preferences.driverGenderPref === option.value
                      ? 'border-purple-500 bg-purple-500'
                      : 'border-gray-300'
                  }`}
                >
                  {preferences.driverGenderPref === option.value && (
                    <div className="h-2 w-2 rounded-full bg-white" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{option.label}</div>
                  <div className="text-sm text-muted-foreground">{option.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Note: "Prefer" options prioritize your choice but don't exclude others
        </p>
      </div>

      {/* LGBTQ+ Friendly Requirement */}
      <div className="rounded-xl border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-pink-50 p-4 dark:border-purple-700 dark:from-purple-950 dark:to-pink-950">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={preferences.requireLgbtqFriendly}
            onChange={(e) => onChange({ requireLgbtqFriendly: e.target.checked })}
            className="mt-1 h-5 w-5 rounded border-gray-300 text-purple-600 focus:ring-2 focus:ring-purple-500/20"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Require LGBTQ+ friendly drivers</span>
              <span className="text-xl">🏳️‍🌈</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Only show drivers who have marked themselves as LGBTQ+ friendly
            </p>
          </div>
        </label>
      </div>

      {/* Minimum Driver Rating */}
      <div>
        <label className="block text-sm font-medium mb-3">
          <Star className="inline h-4 w-4 mr-1 text-yellow-500 fill-yellow-500" />
          Minimum Driver Rating
        </label>
        <div className="grid grid-cols-2 gap-3">
          {ratingLabels.map((option) => (
            <button
              key={option.value}
              onClick={() => onChange({ minDriverRating: option.value })}
              className={`rounded-xl border-2 px-4 py-3 transition-all hover:border-purple-500 ${
                preferences.minDriverRating === option.value
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-950'
                  : 'border-gray-300 dark:border-zinc-700'
              }`}
            >
              <div className="text-center">
                <div className="text-2xl font-bold">{option.label}</div>
                <div className="text-xs text-muted-foreground">{option.description}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm text-muted-foreground dark:bg-zinc-800">
          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
          <span>
            Currently set to{' '}
            <strong className="text-foreground">{preferences.minDriverRating}+</strong>
          </span>
        </div>
      </div>

      {/* Additional Safety Options */}
      <div className="space-y-3">
        <label className="block text-sm font-medium mb-3">Additional Safety Settings</label>

        {/* Require Verification */}
        <label className="flex items-start gap-3 cursor-pointer rounded-xl border-2 border-gray-300 bg-white p-4 transition-all hover:border-purple-500 dark:border-zinc-700 dark:bg-zinc-900">
          <input
            type="checkbox"
            checked={preferences.requireVerification}
            onChange={(e) => onChange({ requireVerification: e.target.checked })}
            className="mt-0.5 h-5 w-5 rounded border-gray-300 text-purple-600 focus:ring-2 focus:ring-purple-500/20"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
              <span className="font-medium">Require verified drivers</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Only show drivers who've completed background checks and ID verification
            </p>
          </div>
        </label>

        {/* Avoid Disputes */}
        <label className="flex items-start gap-3 cursor-pointer rounded-xl border-2 border-gray-300 bg-white p-4 transition-all hover:border-purple-500 dark:border-zinc-700 dark:bg-zinc-900">
          <input
            type="checkbox"
            checked={preferences.avoidDisputes}
            onChange={(e) => onChange({ avoidDisputes: e.target.checked })}
            className="mt-0.5 h-5 w-5 rounded border-gray-300 text-purple-600 focus:ring-2 focus:ring-purple-500/20"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <span className="font-medium">Avoid drivers with active disputes</span>
              <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                Recommended
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Hide drivers who currently have unresolved safety or conduct disputes
            </p>
          </div>
        </label>
      </div>

      {/* Privacy Note */}
      <div className="rounded-xl bg-gray-100 p-4 dark:bg-zinc-800">
        <div className="flex gap-3">
          <Shield className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <strong className="text-foreground">Your privacy matters:</strong> Your safety
            preferences are private and never shared with drivers. Drivers only see that they're a
            match for you, not why.
          </div>
        </div>
      </div>
    </div>
  );
}
