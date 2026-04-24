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

      .hmu-card-in { animation: hmuBrowseCardIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both; }

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
      }
      .hmu-feed-bg {
        position: absolute; inset: 0;
        background-size: cover; background-position: center;
        filter: blur(30px); transform: scale(1.15);
      }
      .hmu-feed-overlay {
        position: absolute; inset: 0;
        background: linear-gradient(180deg, rgba(8,8,8,0.55) 0%, rgba(8,8,8,0.15) 40%, rgba(8,8,8,0.85) 100%);
      }
      .hmu-skeleton {
        background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 100%);
        background-size: 200% 100%;
        animation: hmuBrowseShimmer 1.4s ease-in-out infinite;
      }
    `}</style>
  );
}
