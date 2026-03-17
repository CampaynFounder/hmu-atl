'use client';

interface RatingIntroProps {
  userType: 'rider' | 'driver';
}

const RATINGS = [
  {
    emoji: '✅',
    label: 'CHILL',
    color: 'emerald',
    tagline: 'The standard. Solid.',
    description: 'On time, no drama, easy ride. This is the baseline — every good experience.',
    weight: 1.0,
    bgClass: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800',
    labelClass: 'text-emerald-700 dark:text-emerald-300',
  },
  {
    emoji: '😎',
    label: 'Cool AF',
    color: 'blue',
    tagline: 'Above and beyond.',
    description: 'They made the ride better — great energy, early, went the extra mile. Worth 1.5× in your Chill Score.',
    weight: 1.5,
    bgClass: 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800',
    labelClass: 'text-blue-700 dark:text-blue-300',
  },
  {
    emoji: '👀',
    label: 'Kinda Creepy',
    color: 'orange',
    tagline: 'Something felt off.',
    description: 'Nothing dangerous, just uncomfortable — weird comments, bad energy. We track it.',
    weight: 0,
    bgClass: 'bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800',
    labelClass: 'text-orange-700 dark:text-orange-300',
  },
  {
    emoji: '🚩',
    label: 'WEIRDO',
    color: 'red',
    tagline: 'Safety concern.',
    description: 'This goes to admin immediately. Three WEIRDOs from different people triggers a review. Zero tolerance.',
    weight: 0,
    bgClass: 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800',
    labelClass: 'text-red-700 dark:text-red-300',
  },
];

export function RatingIntro({ userType }: RatingIntroProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-4">
        <p className="text-sm text-zinc-300 leading-relaxed">
          {userType === 'rider'
            ? 'After every ride you rate your driver — and they rate you. These four ratings are how HMU keeps the community right.'
            : 'After every ride you rate your rider — and they rate you. These four ratings are how HMU keeps the vibe right for everyone.'}
        </p>
      </div>

      <div className="space-y-3">
        {RATINGS.map((r) => (
          <div key={r.label} className={`rounded-xl border-2 p-4 ${r.bgClass}`}>
            <div className="flex items-start gap-3">
              <span className="text-3xl leading-none">{r.emoji}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-black text-lg tracking-tight ${r.labelClass}`}>{r.label}</span>
                  {r.weight === 1.5 && (
                    <span className="rounded-full bg-blue-100 dark:bg-blue-900 px-2 py-0.5 text-xs font-bold text-blue-700 dark:text-blue-300">
                      1.5× boost
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold text-foreground mb-0.5">{r.tagline}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{r.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chill Score explanation */}
      <div className="rounded-xl bg-zinc-100 dark:bg-zinc-800 p-4 space-y-2">
        <p className="text-sm font-bold">What is a Chill Score?</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Your Chill Score is a percentage based on your ratings.{' '}
          <strong className="text-foreground">CHILL = 1 point. Cool AF = 1.5 points.</strong>{' '}
          Kinda Creepy and WEIRDO don't add points — they just lower your average.
          A 90%+ score means people love riding with you.
        </p>
        <div className="flex gap-2 pt-1">
          {[
            { score: '90%+', label: 'Top tier', color: 'text-emerald-600 dark:text-emerald-400' },
            { score: '75%+', label: 'Solid', color: 'text-blue-600 dark:text-blue-400' },
            { score: '50%+', label: 'Decent', color: 'text-orange-600 dark:text-orange-400' },
            { score: '<50%', label: 'At risk', color: 'text-red-600 dark:text-red-400' },
          ].map((item) => (
            <div key={item.score} className="flex-1 text-center rounded-lg bg-white dark:bg-zinc-700 p-2">
              <div className={`text-sm font-black ${item.color}`}>{item.score}</div>
              <div className="text-xs text-muted-foreground">{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-center text-muted-foreground">
        {userType === 'rider'
          ? 'Riders with a Chill Score below a driver\'s minimum can\'t book them directly.'
          : 'You can set a minimum Chill Score for riders who want to book you directly.'}
      </p>
    </div>
  );
}
