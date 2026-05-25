'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { SwipeableCard } from '@/components/blast/motion/swipeable-card';
import { useAbly } from '@/hooks/use-ably';

interface DownBadPost {
  id: string;
  price: number;
  expiresAt: string;
  pickupAddress: string;
  dropoffAddress: string;
  sumExtraText: string;
  sumExtraMediaUrl: string;
  sumExtraMediaType: 'photo' | 'video';
  isDirectOffer: boolean;
  riderName: string;
  riderAvatarUrl: string | null;
  chillScore: number;
  completedRides: number;
  createdAt: string;
}

type ActionState = 'idle' | 'accepting' | 'passing';

export default function DriverDownBadClient() {
  const router = useRouter();
  const [posts, setPosts] = useState<DownBadPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState<ActionState>('idle');
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [marketSlug, setMarketSlug] = useState<string>('');
  const actionRef = useRef<ActionState>('idle');
  actionRef.current = actionState;

  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    fetch('/api/drivers/down-bad')
      .then(r => r.json())
      .then((data: { posts: DownBadPost[]; marketSlug: string }) => {
        setPosts(data.posts || []);
        setMarketSlug(data.marketSlug || '');
      })
      .catch(() => showToast('Failed to load posts', 'err'))
      .finally(() => setLoading(false));
  }, [showToast]);

  // Ably: new Down Bad posts arrive in real-time
  useAbly({
    channelName: marketSlug ? `market:${marketSlug}:down-bad` : null,
    onMessage: useCallback((msg: { name: string; data: unknown }) => {
      if (msg.name !== 'down_bad_posted') return;
      const d = msg.data as { postId: string };
      fetch('/api/drivers/down-bad')
        .then(r => r.json())
        .then((fresh: { posts: DownBadPost[] }) => {
          const newPost = fresh.posts.find(p => p.id === d.postId);
          if (newPost) {
            setPosts(prev => {
              if (prev.some(p => p.id === newPost.id)) return prev;
              return [newPost, ...prev];
            });
          }
        })
        .catch(() => {});
    }, []),
  });

  const currentPost = posts[0] ?? null;

  const dismiss = useCallback((postId: string) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
  }, []);

  const handleRunIt = useCallback(async () => {
    if (!currentPost || actionRef.current !== 'idle') return;
    setActionState('accepting');
    try {
      const res = await fetch(`/api/bookings/${currentPost.id}/accept`, { method: 'POST' });
      const data = await res.json() as { status?: string; rideId?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed');
      dismiss(currentPost.id);
      showToast('Ride matched — let\'s go! 🔥');
      if (data.rideId) router.push(`/driver/rides/${data.rideId}`);
    } catch (e) {
      showToast((e as Error).message || 'Failed to accept', 'err');
    } finally {
      setActionState('idle');
    }
  }, [currentPost, dismiss, showToast, router]);

  const handlePass = useCallback(async () => {
    if (!currentPost || actionRef.current !== 'idle') return;
    setActionState('passing');
    try {
      await fetch(`/api/bookings/${currentPost.id}/decline`, { method: 'POST' });
      dismiss(currentPost.id);
    } catch {
      // Optimistic dismiss even on network error
      dismiss(currentPost.id);
    } finally {
      setActionState('idle');
    }
  }, [currentPost, dismiss]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black" style={{ paddingTop: 56 }}>
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col min-h-screen bg-black overflow-hidden" style={{ paddingTop: 56 }}>
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-4 pb-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white"
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="text-center">
          <p className="text-white font-bold text-base tracking-wide">DOWN BAD</p>
          {posts.length > 0 && (
            <p className="text-white/50 text-xs">{posts.length} available</p>
          )}
        </div>
        <div className="w-9" />
      </div>

      {/* Card stack */}
      <div className="flex-1 relative flex items-center justify-center px-4">
        <AnimatePresence mode="popLayout">
          {currentPost ? (
            <SwipeableCard
              key={currentPost.id}
              axis="x"
              leftLabel="PASS"
              rightLabel="RUN IT"
              onSwipeRight={handleRunIt}
              onSwipeLeft={handlePass}
              className="w-full max-w-sm"
              ariaLabel={`Down Bad post from ${currentPost.riderName}`}
            >
              <DownBadCard post={currentPost} />
            </SwipeableCard>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center px-8"
            >
              <p className="text-5xl mb-4">😮‍💨</p>
              <p className="text-white font-bold text-xl mb-2">All caught up</p>
              <p className="text-white/50 text-sm">No Down Bad posts right now — new ones will appear here automatically.</p>
              <button
                onClick={() => router.back()}
                className="mt-8 px-6 py-3 rounded-full bg-white/10 text-white text-sm font-semibold"
              >
                Back to Home
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Background peek card */}
        {posts.length > 1 && (
          <div
            className="absolute inset-0 flex items-center justify-center px-4 pointer-events-none"
            style={{ zIndex: -1 }}
          >
            <div
              className="w-full max-w-sm rounded-3xl bg-white/5 border border-white/10"
              style={{ transform: 'scale(0.94) translateY(12px)', height: 520 }}
            />
          </div>
        )}
      </div>

      {/* Tap action buttons */}
      {currentPost && (
        <div className="flex items-center justify-center gap-6 pb-safe pb-8 pt-4">
          <button
            onClick={handlePass}
            disabled={actionState !== 'idle'}
            className="w-16 h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-2xl active:scale-95 transition-transform disabled:opacity-50"
            aria-label="Pass"
          >
            ✗
          </button>
          <button
            onClick={handleRunIt}
            disabled={actionState !== 'idle'}
            className="w-20 h-20 rounded-full bg-[#00E676] flex items-center justify-center text-black font-black text-sm active:scale-95 transition-transform disabled:opacity-50 shadow-lg shadow-[#00E676]/30"
            aria-label="Run It"
          >
            {actionState === 'accepting' ? (
              <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : (
              'RUN IT'
            )}
          </button>
          <div className="w-16 h-16" />
        </div>
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-28 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-sm font-semibold shadow-xl z-50 ${
              toast.type === 'ok' ? 'bg-[#00E676] text-black' : 'bg-red-500 text-white'
            }`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DownBadCard({ post }: { post: DownBadPost }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (post.sumExtraMediaType === 'video' && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [post.id, post.sumExtraMediaType]);

  const timeLeft = (() => {
    const ms = new Date(post.expiresAt).getTime() - Date.now();
    if (ms <= 0) return 'Expired';
    const mins = Math.floor(ms / 60_000);
    if (mins < 60) return `${mins}m left`;
    return `${Math.floor(mins / 60)}h left`;
  })();

  return (
    <div className="w-full rounded-3xl overflow-hidden bg-[#111] border border-white/10 shadow-2xl select-none" style={{ height: 540 }}>
      {/* Media — top 60% */}
      <div className="relative" style={{ height: '62%' }}>
        {post.sumExtraMediaType === 'video' ? (
          <video
            ref={videoRef}
            src={post.sumExtraMediaUrl}
            className="w-full h-full object-cover"
            loop
            muted
            playsInline
            autoPlay
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.sumExtraMediaUrl}
            alt="Sum extra"
            className="w-full h-full object-cover"
            draggable={false}
          />
        )}

        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, transparent 50%, #111 100%)' }}
        />

        {/* Sum extra badge — bottom-left of media */}
        <div className="absolute bottom-3 left-3 right-3">
          <p className="text-white font-semibold text-sm leading-snug line-clamp-2 drop-shadow-sm">
            🎁 {post.sumExtraText}
          </p>
        </div>

        {/* Direct offer badge — top left */}
        {post.isDirectOffer && (
          <div className="absolute top-3 left-3 bg-[#00E676] text-black rounded-full px-3 py-1 text-xs font-bold">
            For You
          </div>
        )}

        {/* Time left — top right */}
        <div className="absolute top-3 right-3 bg-black/60 rounded-full px-3 py-1 text-xs text-white/80 font-medium">
          {timeLeft}
        </div>
      </div>

      {/* Info — bottom 38% */}
      <div className="px-4 pt-3 pb-4 flex flex-col gap-2" style={{ height: '38%' }}>
        {/* Price */}
        <div className="flex items-center justify-between">
          <span className="text-[#00E676] font-black text-2xl">${post.price}</span>
          <div className="flex items-center gap-2 text-white/50 text-xs">
            <span>⭐ {post.chillScore}</span>
            <span>·</span>
            <span>{post.completedRides} rides</span>
          </div>
        </div>

        {/* Route */}
        <div className="flex flex-col gap-1">
          <div className="flex items-start gap-2">
            <span className="text-[#00E676] text-sm mt-0.5 shrink-0">▲</span>
            <p className="text-white/80 text-sm leading-tight line-clamp-1">{post.pickupAddress}</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-red-400 text-sm mt-0.5 shrink-0">●</span>
            <p className="text-white/60 text-sm leading-tight line-clamp-1">{post.dropoffAddress}</p>
          </div>
        </div>

        {/* Rider */}
        <div className="flex items-center gap-2 mt-auto">
          {post.riderAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.riderAvatarUrl} alt={post.riderName} className="w-6 h-6 rounded-full object-cover" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs text-white font-bold">
              {post.riderName[0]?.toUpperCase()}
            </div>
          )}
          <span className="text-white/50 text-xs">{post.riderName}</span>
        </div>
      </div>
    </div>
  );
}
