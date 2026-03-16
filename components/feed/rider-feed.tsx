'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { RiderFeedCard } from './rider-feed-card';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface RiderRequest {
  rider: {
    id: string;
    clerkId: string;
    firstName?: string;
    lastName?: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    rating: number;
    isVerified: boolean;
    gender?: string;
    pronouns?: string;
    lgbtqFriendly: boolean;
  };
  request: {
    id: string;
    pickupAddress: string;
    pickupLat: number;
    pickupLng: number;
    dropoffAddress: string;
    dropoffLat: number;
    dropoffLng: number;
    stops?: Array<{ address: string; lat: number; lng: number }>;
    offerAmount: number;
    distance: number;
    estimatedDuration: number;
    note?: string;
    requestedAt: Date;
  };
  match: {
    score: number;
    reasons: string[];
    distanceToPickup: number;
    estimatedETA: number;
  };
}

interface RiderFeedProps {
  initialRequests?: RiderRequest[];
  onFiltersOpen?: () => void;
}

export function RiderFeed({ initialRequests = [], onFiltersOpen }: RiderFeedProps) {
  const [requests, setRequests] = useState<RiderRequest[]>(initialRequests);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch more requests when near the end
  const fetchMore = useCallback(async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/feed/riders?page=${page + 1}`);
      const data = await res.json();

      if (data.success && data.requests.length > 0) {
        setRequests((prev) => [...prev, ...data.requests]);
        setPage((p) => p + 1);
        setHasMore(data.hasMore);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Failed to fetch more requests:', error);
    } finally {
      setLoading(false);
    }
  }, [page, loading, hasMore]);

  // Load more when within 2 cards of the end
  useEffect(() => {
    if (currentIndex >= requests.length - 2 && hasMore && !loading) {
      fetchMore();
    }
  }, [currentIndex, requests.length, hasMore, loading, fetchMore]);

  const handleAccept = async (requestId: string, amount: number) => {
    try {
      const res = await fetch(`/api/rides/${requestId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptedAmount: amount }),
      });

      if (res.ok) {
        // Remove accepted request and move to next
        setRequests((prev) => prev.filter((r) => r.request.id !== requestId));
        // Current index stays the same (next card slides in)
      }
    } catch (error) {
      console.error('Failed to accept ride:', error);
    }
  };

  const handleCounter = async (requestId: string, counterAmount: number) => {
    try {
      const res = await fetch(`/api/rides/${requestId}/counter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counterOffer: counterAmount }),
      });

      if (res.ok) {
        // Keep card in feed but show "Counter sent" feedback
        // TODO: Add toast notification
        console.log(`Counter offer of $${counterAmount} sent`);
      }
    } catch (error) {
      console.error('Failed to send counter offer:', error);
    }
  };

  const handleSkip = (requestId: string) => {
    // Remove skipped request and move to next
    setRequests((prev) => prev.filter((r) => r.request.id !== requestId));
    // Current index stays the same (next card slides in)
  };

  const handleMessage = (riderId: string) => {
    // TODO: Open messaging modal
    console.log(`Open message to rider ${riderId}`);
  };

  const currentRequest = requests[currentIndex];
  const nextRequest = requests[currentIndex + 1];

  if (requests.length === 0 && !loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="text-6xl">😴</div>
        <div>
          <h2 className="text-2xl font-bold">No ride requests right now</h2>
          <p className="mt-2 text-muted-foreground">
            Check back soon or adjust your filters to see more requests
          </p>
        </div>
        {onFiltersOpen && (
          <button
            onClick={onFiltersOpen}
            className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground transition-all hover:bg-primary/90"
          >
            <SlidersHorizontal className="h-5 w-5" />
            Adjust Filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-gradient-to-b from-zinc-950 to-black"
    >
      {/* Top Toolbar */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between p-4">
        <div className="flex items-center gap-2 rounded-full bg-black/50 px-4 py-2 backdrop-blur-sm">
          <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          <span className="text-sm font-medium text-white">Online</span>
        </div>

        {onFiltersOpen && (
          <button
            onClick={onFiltersOpen}
            className="rounded-full bg-black/50 p-3 text-white backdrop-blur-sm transition-all hover:bg-black/70"
          >
            <SlidersHorizontal className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Card Stack (TikTok-style) */}
      <div className="relative h-full w-full">
        <AnimatePresence mode="popLayout">
          {/* Next Card (background, slightly scaled down) */}
          {nextRequest && (
            <motion.div
              key={`next-${nextRequest.request.id}`}
              className="absolute inset-0 px-4 pb-4 pt-20"
              initial={{ scale: 0.9, opacity: 0.5, y: 40 }}
              animate={{ scale: 0.95, opacity: 0.7, y: 20 }}
              exit={{ scale: 0.9, opacity: 0, y: 40 }}
              transition={{ duration: 0.3 }}
            >
              <div className="h-full w-full rounded-3xl bg-zinc-800/50 backdrop-blur-sm" />
            </motion.div>
          )}

          {/* Current Card (foreground) */}
          {currentRequest && (
            <motion.div
              key={`current-${currentRequest.request.id}`}
              className="absolute inset-0 px-4 pb-4 pt-20"
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 1.05, opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <RiderFeedCard
                rider={currentRequest.rider}
                request={currentRequest.request}
                match={currentRequest.match}
                onAccept={handleAccept}
                onCounter={handleCounter}
                onSkip={handleSkip}
                onMessage={handleMessage}
                isActive={true}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Progress Indicator */}
      <div className="absolute bottom-8 left-0 right-0 z-10 flex justify-center gap-1 px-8">
        {requests.slice(currentIndex, currentIndex + 5).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all ${
              i === 0 ? 'bg-white' : 'bg-white/30'
            }`}
          />
        ))}
      </div>

      {/* Loading Indicator */}
      {loading && (
        <div className="absolute bottom-24 left-0 right-0 z-10 flex justify-center">
          <div className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-white backdrop-blur-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading more...</span>
          </div>
        </div>
      )}

      {/* No More Requests */}
      {!hasMore && requests.length > 0 && currentIndex >= requests.length - 1 && (
        <div className="absolute bottom-24 left-0 right-0 z-10 flex justify-center">
          <div className="rounded-full bg-black/70 px-6 py-3 text-white backdrop-blur-sm">
            <span className="text-sm font-medium">You've seen all requests 🎉</span>
          </div>
        </div>
      )}
    </div>
  );
}
