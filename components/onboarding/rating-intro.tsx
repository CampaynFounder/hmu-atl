'use client';

interface RatingIntroProps {
  userType: 'rider' | 'driver';
}

const RATINGS = [
  {
    emoji: '\u2705',
    label: 'CHILL',
    tagline: 'The standard. Solid.',
    description: 'On time, no drama, easy ride. This is the baseline — every good experience.',
    weight: 1.0,
    labelColor: '#00E676',
    borderColor: 'rgba(0,230,118,0.3)',
    bgColor: 'rgba(0,230,118,0.06)',
  },
  {
    emoji: '\uD83D\uDE0E',
    label: 'Cool AF',
    tagline: 'Above and beyond.',
    description: 'They made the ride better — great energy, early, went the extra mile. Worth 1.5x in your Chill Score.',
    weight: 1.5,
    labelColor: '#448AFF',
    borderColor: 'rgba(68,138,255,0.3)',
    bgColor: 'rgba(68,138,255,0.06)',
  },
  {
    emoji: '\uD83D\uDC40',
    label: 'Kinda Creepy',
    tagline: 'Something felt off.',
    description: 'Nothing dangerous, just uncomfortable — weird comments, bad energy. We track it.',
    weight: 0,
    labelColor: '#FFB300',
    borderColor: 'rgba(255,179,0,0.3)',
    bgColor: 'rgba(255,179,0,0.06)',
  },
  {
    emoji: '\uD83D\uDEA9',
    label: 'WEIRDO',
    tagline: 'Safety concern.',
    description: 'This goes to admin immediately. Three WEIRDOs from different people triggers a review. Zero tolerance.',
    weight: 0,
    labelColor: '#FF5252',
    borderColor: 'rgba(255,82,82,0.3)',
    bgColor: 'rgba(255,82,82,0.06)',
  },
];

export function RatingIntro({ userType }: RatingIntroProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12, padding: 14,
      }}>
        <p style={{ fontSize: 14, color: '#ccc', lineHeight: 1.5 }}>
          {userType === 'rider'
            ? 'After every ride you rate your driver — and they rate you. These four ratings keep the community right.'
            : 'After every ride you rate your rider — and they rate you. These four ratings keep the vibe right for everyone.'}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {RATINGS.map((r) => (
          <div key={r.label} style={{
            background: r.bgColor, border: `2px solid ${r.borderColor}`,
            borderRadius: 14, padding: 16,
            display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{r.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 900, fontSize: 17, color: r.labelColor, letterSpacing: 0.5 }}>
                  {r.label}
                </span>
                {r.weight === 1.5 && (
                  <span style={{
                    background: 'rgba(68,138,255,0.15)', color: '#448AFF',
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                  }}>
                    1.5x boost
                  </span>
                )}
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 2 }}>{r.tagline}</p>
              <p style={{ fontSize: 12, color: '#aaa', lineHeight: 1.4 }}>{r.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Chill Score explanation */}
      <div style={{
        background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14, padding: 16,
      }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
          What is a Chill Score?
        </p>
        <p style={{ fontSize: 12, color: '#bbb', lineHeight: 1.5, marginBottom: 10 }}>
          Your Chill Score is a percentage based on your ratings.{' '}
          <strong style={{ color: '#fff' }}>CHILL = 1 point. Cool AF = 1.5 points.</strong>{' '}
          Kinda Creepy and WEIRDO don&apos;t add points — they just lower your average.
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { score: '90%+', label: 'Top tier', color: '#00E676' },
            { score: '75%+', label: 'Solid', color: '#448AFF' },
            { score: '50%+', label: 'Decent', color: '#FFB300' },
            { score: '<50%', label: 'At risk', color: '#FF5252' },
          ].map((item) => (
            <div key={item.score} style={{
              flex: 1, textAlign: 'center', background: '#141414',
              borderRadius: 10, padding: '8px 4px',
            }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: item.color }}>{item.score}</div>
              <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 12, textAlign: 'center', color: '#888' }}>
        {userType === 'rider'
          ? "Riders with a Chill Score below a driver's minimum can't book them directly."
          : 'You can set a minimum Chill Score for riders who want to book you directly.'}
      </p>
    </div>
  );
}
