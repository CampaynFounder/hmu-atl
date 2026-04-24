// Shimmer placeholders matching the FeedCard / GridCard footprint so the
// next-page fetch doesn't pop the layout.

export function FeedSkeleton() {
  return (
    <div className="hmu-feed-card">
      <div className="hmu-feed-bg hmu-skeleton" />
      <div className="hmu-feed-overlay" />
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div className="hmu-skeleton" style={{
          width: 140, height: 140, borderRadius: '50%',
          transform: 'translateY(-40px)',
        }} />
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 28 }}>
        <div className="hmu-skeleton" style={{ height: 120, borderRadius: 22 }} />
      </div>
    </div>
  );
}

export function GridSkeleton() {
  return (
    <div style={{
      background: '#141414',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 20,
      overflow: 'hidden',
    }}>
      <div className="hmu-skeleton" style={{ width: '100%', aspectRatio: '4 / 3' }} />
      <div style={{ padding: '12px 14px 14px' }}>
        <div className="hmu-skeleton" style={{ height: 14, borderRadius: 4, marginBottom: 6, width: '60%' }} />
        <div className="hmu-skeleton" style={{ height: 10, borderRadius: 4, marginBottom: 10, width: '40%' }} />
        <div className="hmu-skeleton" style={{ height: 32, borderRadius: 100 }} />
      </div>
    </div>
  );
}
