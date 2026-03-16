'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { MapPin, DollarSign, Clock, Star, Shield, Heart } from 'lucide-react';

interface RiderFeedCardProps {
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
    distance: number; // miles
    estimatedDuration: number; // minutes
    note?: string;
    requestedAt: Date;
  };
  match: {
    score: number;
    reasons: string[];
    distanceToPickup: number; // miles
    estimatedETA: number; // minutes
  };
  onAccept: (requestId: string, amount: number) => void;
  onCounter: (requestId: string, counterAmount: number) => void;
  onSkip: (requestId: string) => void;
  onMessage: (riderId: string) => void;
  isActive?: boolean;
}

export function RiderFeedCard({
  rider,
  request,
  match,
  onAccept,
  onCounter,
  onSkip,
  onMessage,
  isActive = true,
}: RiderFeedCardProps) {
  const [showCounterInput, setShowCounterInput] = useState(false);
  const [counterAmount, setCounterAmount] = useState(request.offerAmount + 5);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Swipe gesture handling
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-150, 0, 150], [0.5, 1, 0.5]);
  const rotateZ = useTransform(x, [-150, 0, 150], [-10, 0, 10]);

  // Auto-play video when card is active
  useEffect(() => {
    if (isActive && videoRef.current && rider.videoUrl) {
      videoRef.current.play().catch(() => {
        // Auto-play failed, user interaction required
        setIsPlaying(false);
      });
      setIsPlaying(true);
    } else if (!isActive && videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, [isActive, rider.videoUrl]);

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const swipeThreshold = 100;

    if (info.offset.x > swipeThreshold) {
      // Swiped right = Accept
      onAccept(request.id, request.offerAmount);
    } else if (info.offset.x < -swipeThreshold) {
      // Swiped left = Skip
      onSkip(request.id);
    }
  };

  const handleAccept = () => {
    onAccept(request.id, request.offerAmount);
  };

  const handleCounter = () => {
    if (showCounterInput) {
      onCounter(request.id, counterAmount);
      setShowCounterInput(false);
    } else {
      setShowCounterInput(true);
    }
  };

  const displayName = rider.firstName
    ? `${rider.firstName}${rider.lastName ? ` ${rider.lastName.charAt(0)}.` : ''}`
    : 'Rider';

  return (
    <motion.div
      className="relative h-full w-full overflow-hidden rounded-3xl bg-gradient-to-b from-zinc-900 to-black"
      style={{ x, opacity, rotateZ }}
      drag={isActive ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={handleDragEnd}
    >
      {/* Video Background */}
      <div className="absolute inset-0">
        {rider.videoUrl ? (
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            loop
            muted
            playsInline
            poster={rider.thumbnailUrl}
            onClick={() => {
              if (videoRef.current) {
                if (isPlaying) {
                  videoRef.current.pause();
                  setIsPlaying(false);
                } else {
                  videoRef.current.play();
                  setIsPlaying(true);
                }
              }
            }}
          >
            <source src={rider.videoUrl} type="video/mp4" />
          </video>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
            <div className="text-8xl font-bold text-white opacity-30">
              {displayName.charAt(0)}
            </div>
          </div>
        )}

        {/* Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />
      </div>

      {/* Content Overlay */}
      <div className="relative flex h-full flex-col justify-between p-6 text-white">
        {/* Top Section - Match Score & Badges */}
        <div className="flex items-start justify-between">
          {/* Match Score */}
          {match.score > 0 && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center gap-2 rounded-full bg-green-500/90 px-4 py-2 backdrop-blur-sm"
            >
              <Heart className="h-4 w-4 fill-white" />
              <span className="text-sm font-bold">{Math.round(match.score)}% Match</span>
            </motion.div>
          )}

          {/* Badges */}
          <div className="flex flex-col gap-2">
            {rider.isVerified && (
              <div className="flex items-center gap-1 rounded-full bg-blue-500/90 px-3 py-1 text-xs backdrop-blur-sm">
                <Shield className="h-3 w-3" />
                <span>Verified</span>
              </div>
            )}
            {rider.lgbtqFriendly && (
              <div className="rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-purple-500 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                🏳️‍🌈 LGBTQ+ Friendly
              </div>
            )}
          </div>
        </div>

        {/* Bottom Section - Ride Details */}
        <div className="space-y-4">
          {/* Match Reasons */}
          {match.reasons.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {match.reasons.slice(0, 3).map((reason, i) => (
                <span
                  key={i}
                  className="rounded-full bg-white/20 px-3 py-1 text-xs backdrop-blur-sm"
                >
                  ✓ {reason}
                </span>
              ))}
            </div>
          )}

          {/* Rider Info */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">{displayName}</h2>
              {rider.pronouns && (
                <span className="text-sm text-white/70">({rider.pronouns})</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                {rider.rating.toFixed(1)}
              </span>
              <span>·</span>
              <span>{match.distanceToPickup.toFixed(1)} mi away</span>
              <span>·</span>
              <span>{match.estimatedETA} min ETA</span>
            </div>
          </div>

          {/* Route Details */}
          <div className="space-y-3 rounded-2xl bg-white/10 p-4 backdrop-blur-md">
            {/* Pickup */}
            <div className="flex items-start gap-3">
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500">
                <MapPin className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-white/70">Pickup</p>
                <p className="font-medium">{request.pickupAddress}</p>
              </div>
            </div>

            {/* Stops */}
            {request.stops && request.stops.length > 0 && (
              <div className="ml-4 border-l-2 border-dashed border-white/30 pl-7 py-2">
                {request.stops.map((stop, i) => (
                  <p key={i} className="text-sm text-white/80">
                    Stop {i + 1}: {stop.address}
                  </p>
                ))}
              </div>
            )}

            {/* Dropoff */}
            <div className="flex items-start gap-3">
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500">
                <MapPin className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-white/70">Dropoff</p>
                <p className="font-medium">{request.dropoffAddress}</p>
              </div>
            </div>

            {/* Trip Stats */}
            <div className="flex items-center justify-between border-t border-white/20 pt-3">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4" />
                <span>{request.estimatedDuration} min</span>
                <span>·</span>
                <span>{request.distance.toFixed(1)} mi</span>
              </div>
              <div className="flex items-center gap-1">
                <DollarSign className="h-5 w-5" />
                <span className="text-2xl font-bold">{request.offerAmount}</span>
              </div>
            </div>
          </div>

          {/* Rider Note */}
          {request.note && (
            <div className="rounded-xl bg-white/10 p-3 backdrop-blur-sm">
              <p className="text-sm italic text-white/90">"{request.note}"</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {/* Counter Amount Input */}
            {showCounterInput && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="flex items-center gap-3 rounded-xl bg-white/20 p-3 backdrop-blur-sm"
              >
                <span className="text-sm">Counter offer:</span>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  <input
                    type="number"
                    value={counterAmount}
                    onChange={(e) => setCounterAmount(Number(e.target.value))}
                    className="w-20 rounded-lg bg-white/20 px-3 py-2 text-center font-bold backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/50"
                    min={request.offerAmount}
                    step={5}
                  />
                </div>
              </motion.div>
            )}

            {/* Primary Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => onSkip(request.id)}
                className="rounded-full border-2 border-white/30 bg-white/10 px-6 py-4 font-semibold backdrop-blur-sm transition-all hover:bg-white/20 active:scale-95"
              >
                Skip
              </button>
              <button
                onClick={handleAccept}
                className="rounded-full bg-gradient-to-r from-green-500 to-emerald-500 px-6 py-4 font-bold shadow-lg transition-all hover:shadow-xl active:scale-95"
              >
                Accept ${request.offerAmount}
              </button>
            </div>

            {/* Secondary Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleCounter}
                className={`rounded-full px-6 py-3 font-medium backdrop-blur-sm transition-all active:scale-95 ${
                  showCounterInput
                    ? 'bg-yellow-500 text-black'
                    : 'bg-white/20 hover:bg-white/30'
                }`}
              >
                {showCounterInput ? `Send $${counterAmount}` : 'Counter Offer'}
              </button>
              <button
                onClick={() => onMessage(rider.id)}
                className="rounded-full bg-white/20 px-6 py-3 font-medium backdrop-blur-sm transition-all hover:bg-white/30 active:scale-95"
              >
                Message
              </button>
            </div>
          </div>

          {/* Swipe Hints */}
          <div className="flex items-center justify-center gap-4 text-xs text-white/50">
            <span>← Swipe left to skip</span>
            <span>·</span>
            <span>Swipe right to accept →</span>
          </div>
        </div>
      </div>

      {/* Swipe Indicators */}
      <motion.div
        className="pointer-events-none absolute left-8 top-1/2 -translate-y-1/2 text-6xl font-black text-red-500 opacity-0"
        style={{
          opacity: useTransform(x, [-150, -50, 0], [1, 0.5, 0]),
        }}
      >
        SKIP
      </motion.div>
      <motion.div
        className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 text-6xl font-black text-green-500 opacity-0"
        style={{
          opacity: useTransform(x, [0, 50, 150], [0, 0.5, 1]),
        }}
      >
        ACCEPT
      </motion.div>
    </motion.div>
  );
}
