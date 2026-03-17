'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { DriverFeedCard } from './driver-feed-card';
import { Loader2, SlidersHorizontal, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Driver {
  id: string;
  clerkId: string;
  firstName?: string;
  lastName?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  rating: number;
  totalRides: number;
  isVerified: boolean;
  gender?: string;
  pronouns?: string;
  lgbtqFriendly: boolean;
  carMake?: string;
  carModel?: string;
  carColor?: string;
  licensePlate?: string;
}

interface DriverAvailability {
  isOnline: boolean;
  currentLocation?: string;
  distanceFromYou: number;
  estimatedArrival: number;
  acceptingRides: boolean;
}

interface Match {
  score: number;
  reasons: string[];
}

interface DriverListing {
  driver: Driver;
  availability: DriverAvailability;
  match: Match;
}

interface DriverFeedProps {
  initialDrivers?: DriverListing[];
  onFiltersOpen?: () => void;
  onRequestRide?: () => void;
}

export function DriverFeed({
  initialDrivers = [],
  onFiltersOpen,
  onRequestRide,
}: DriverFeedProps) {
  const [drivers, setDrivers] = useState<DriverListing[]>(initialDrivers);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch more drivers when near the end
  const fetchMore = useCallback(async () => {
    if (loading || !hasMore) return;

    // DEMO: In production, this would fetch from the API
    // For now, we're using mock data only, so disable pagination
    setHasMore(false);

    // Commented out for demo - uncomment when API is ready
    /*
    setLoading(true);
    try {
      const res = await fetch(`/api/feed/drivers?page=${page + 1}`);
      const data = await res.json();

      if (data.success && data.drivers.length > 0) {
        setDrivers((prev) => [...prev, ...data.drivers]);
        setPage((p) => p + 1);
        setHasMore(data.hasMore);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Failed to fetch more drivers:', error);
    } finally {
      setLoading(false);
    }
    */
  }, [page, loading, hasMore]);

  // Load more when within 2 cards of the end
  useEffect(() => {
    if (currentIndex >= drivers.length - 2 && hasMore && !loading) {
      fetchMore();
    }
  }, [currentIndex, drivers.length, hasMore, loading, fetchMore]);

  const handleRequest = async (driverId: string) => {
    // Remove driver from feed and show ride request composer
    setDrivers((prev) => prev.filter((d) => d.driver.id !== driverId));

    // Open ride request composer with pre-selected driver
    if (onRequestRide) {
      onRequestRide();
    }

    // DEMO: Track activity (disabled for demo, enable when API is ready)
    /*
    try {
      await fetch('/api/users/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'driver_requested',
          properties: {
            driverId,
          },
        }),
      });
    } catch (error) {
      console.error('Failed to track activity:', error);
    }
    */
  };

  const handleSkip = (driverId: string) => {
    // Remove skipped driver and move to next
    setDrivers((prev) => prev.filter((d) => d.driver.id !== driverId));
    // Current index stays the same (next card slides in)
  };

  const handleMessage = (driverId: string) => {
    // TODO: Open messaging modal
    console.log(`Open message to driver ${driverId}`);
  };

  const currentDriver = drivers[currentIndex];
  const nextDriver = drivers[currentIndex + 1];

  if (drivers.length === 0 && !loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="text-6xl">🚗</div>
        <div>
          <h2 className="text-2xl font-bold">No drivers available right now</h2>
          <p className="mt-2 text-muted-foreground">
            Try adjusting your filters or check back in a few minutes
          </p>
        </div>
        <div className="flex gap-3">
          {onFiltersOpen && (
            <button
              onClick={onFiltersOpen}
              className="flex items-center gap-2 rounded-full bg-secondary px-6 py-3 font-semibold transition-all hover:bg-secondary/80"
            >
              <SlidersHorizontal className="h-5 w-5" />
              Adjust Filters
            </button>
          )}
          {onRequestRide && (
            <button
              onClick={onRequestRide}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 font-semibold text-white transition-all hover:shadow-xl"
            >
              <Plus className="h-5 w-5" />
              Request a Ride
            </button>
          )}
        </div>
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
        {/* Request Ride Button (Prominent +) */}
        {onRequestRide && (
          <button
            onClick={onRequestRide}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2.5 font-bold text-white shadow-lg backdrop-blur-sm transition-all hover:shadow-xl active:scale-95"
          >
            <Plus className="h-5 w-5" />
            <span>Request Ride</span>
          </button>
        )}

        {/* Filters Button */}
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
          {nextDriver && (
            <motion.div
              key={`next-${nextDriver.driver.id}`}
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
          {currentDriver && (
            <motion.div
              key={`current-${currentDriver.driver.id}`}
              className="absolute inset-0 px-4 pb-4 pt-20"
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 1.05, opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <DriverFeedCard
                driver={currentDriver.driver}
                availability={currentDriver.availability}
                match={currentDriver.match}
                onRequest={handleRequest}
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
        {drivers.slice(currentIndex, currentIndex + 5).map((_, i) => (
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
            <span className="text-sm">Loading more drivers...</span>
          </div>
        </div>
      )}

      {/* No More Drivers */}
      {!hasMore && drivers.length > 0 && currentIndex >= drivers.length - 1 && (
        <div className="absolute bottom-24 left-0 right-0 z-10 flex justify-center">
          <div className="rounded-full bg-black/70 px-6 py-3 text-white backdrop-blur-sm">
            <span className="text-sm font-medium">You've seen all available drivers 🎉</span>
          </div>
        </div>
      )}
    </div>
  );
}
