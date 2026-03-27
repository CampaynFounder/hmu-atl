'use client';

const RATINGS = [
  { type: 'CHILL', emoji: '\u2705', label: 'Good vibes', desc: 'Ride went smooth. No issues.', color: '#00E676' },
  { type: 'Cool AF', emoji: '\uD83D\uDE0E', label: 'Great energy', desc: 'This person made the ride better.', color: '#448AFF' },
  { type: 'Kinda Creepy', emoji: '\uD83D\uDC40', label: 'Something felt off', desc: 'Not dangerous, but uncomfortable.', color: '#FFD740' },
  { type: 'WEIRDO', emoji: '\uD83D\uDEA9', label: 'Safety concern', desc: 'Flagged for admin review. 3 WEIRDOs from different users = account review.', color: '#FF5252' },
];

export default function RatingsInfo() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Intro */}
      <div style={{ fontSize: 14, color: '#bbb', lineHeight: 1.5 }}>
        After every ride, both drivers and riders rate each other. Ratings build your <strong style={{ color: '#00E676' }}>Chill Score</strong> — visible on your profile.
      </div>

      {/* Rating cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {RATINGS.map(r => (
          <div key={r.type} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 14, padding: '14px 16px',
          }}>
            <span style={{ fontSize: 28, flexShrink: 0 }}>{r.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: r.color }}>{r.type}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2, lineHeight: 1.4 }}>{r.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Chill Score formula */}
      <div style={{
        background: 'rgba(0,230,118,0.06)', border: '1px solid rgba(0,230,118,0.15)',
        borderRadius: 14, padding: '14px 16px',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#00E676', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
          Chill Score
        </div>
        <div style={{ fontSize: 13, color: '#bbb', lineHeight: 1.5 }}>
          Your Chill Score is calculated from your ratings. <strong style={{ color: '#fff' }}>CHILL</strong> and <strong style={{ color: '#448AFF' }}>Cool AF</strong> (weighted 1.5x) boost your score. Higher score = more trust from riders and drivers.
        </div>
      </div>

      {/* What happens */}
      <div style={{
        background: 'rgba(255,82,82,0.06)', border: '1px solid rgba(255,82,82,0.15)',
        borderRadius: 14, padding: '14px 16px',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#FF5252', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
          Safety
        </div>
        <div style={{ fontSize: 13, color: '#bbb', lineHeight: 1.5 }}>
          3 WEIRDO ratings from different users triggers an admin review. Mutual WEIRDOs within 5 minutes are flagged as retaliation and ignored. Your dispute count is visible on your profile.
        </div>
      </div>
    </div>
  );
}
