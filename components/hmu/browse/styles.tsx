// Shared CSS for HMU browse surfaces (driver→rider find-riders, rider→driver browse).
// Mount once near the root of the page so the keyframes + scroller class names
// resolve for both FeedCard backdrops and skeleton shimmers.

export default function HmuBrowseStyles() {
  return (
    <style>{`
      @keyframes hmuBrowsePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      @keyframes hmuBrowseGlow { 0% { box-shadow: 0 0 0 rgba(0,230,118,0); } 50% { box-shadow: 0 0 24px rgba(0,230,118,0.55); } 100% { box-shadow: 0 0 0 rgba(0,230,118,0); } }
      @keyframes hmuBrowseShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      @keyframes hmuBrowseCardIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes hmuFeedMediaIn { from { opacity: 0; transform: scale(1.06); } to { opacity: 1; transform: scale(1); } }
      @keyframes hmuChipIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }

      .hmu-card-in { animation: hmuBrowseCardIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both; }

      /* Grid card hover lift */
      .hmu-grid-card {
        transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s, border-color 0.22s;
        will-change: transform;
      }
      .hmu-grid-card:hover {
        transform: translateY(-3px) scale(1.01);
        box-shadow: 0 12px 36px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,230,118,0.15);
      }

      /* HMU button press + hover glow */
      .hmu-btn {
        transition: transform 0.12s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s;
      }
      .hmu-btn:hover { box-shadow: 0 4px 22px rgba(0,230,118,0.45); }
      .hmu-btn:active { transform: scale(0.96); box-shadow: none; }

      /* Filter pill active spring feel */
      .hmu-pill { transition: background 0.15s, color 0.15s, transform 0.12s; }
      .hmu-pill:active { transform: scale(0.93); }

      .hmu-feed-scroller {
        flex: 1; min-height: 0;
        overflow-y: scroll;
        scroll-snap-type: y mandatory;
        scroll-behavior: smooth;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }
      .hmu-feed-scroller::-webkit-scrollbar { display: none; }
      .hmu-feed-card {
        height: 100%;
        scroll-snap-align: start;
        scroll-snap-stop: always;
        position: relative;
        overflow: hidden;
        background: #080808;
      }

      /* Full-bleed feed media (video or img) */
      .hmu-feed-media {
        position: absolute; inset: 0;
        width: 100%; height: 100%;
        object-fit: cover; object-position: center top;
        animation: hmuFeedMediaIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
      }

      /* Gradient scrim — heavier at bottom for card readability */
      .hmu-feed-scrim {
        position: absolute; inset: 0;
        background: linear-gradient(
          180deg,
          rgba(8,8,8,0.18) 0%,
          transparent 25%,
          transparent 42%,
          rgba(8,8,8,0.55) 62%,
          rgba(8,8,8,0.92) 82%,
          rgba(8,8,8,0.98) 100%
        );
      }

      /* Chip stagger entry */
      .hmu-chip { animation: hmuChipIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) both; }
      .hmu-chip:nth-child(1) { animation-delay: 0ms; }
      .hmu-chip:nth-child(2) { animation-delay: 40ms; }
      .hmu-chip:nth-child(3) { animation-delay: 80ms; }

      .hmu-skeleton {
        background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 100%);
        background-size: 200% 100%;
        animation: hmuBrowseShimmer 1.4s ease-in-out infinite;
      }
    `}</style>
  );
}
