'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import {
  Heart,
  Star,
  MapPin,
  Clock,
  Shield,
  CheckCircle2,
  Car,
  MessageCircle,
  X,
  Info,
  Volume2,
  VolumeX,
} from 'lucide-react';

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

interface DriverFeedCardProps {
  driver: Driver;
  availability: DriverAvailability;
  match: Match;
  onRequest: (driverId: string) => void;
  onSkip: (driverId: string) => void;
  onMessage: (driverId: string) => void;
  isActive?: boolean;
}

export function DriverFeedCard({
  driver,
  availability,
  match,
  onRequest,
  onSkip,
  onMessage,
  isActive = true,
}: DriverFeedCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  // Swipe gesture
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-150, 0, 150], [0.5, 1, 0.5]);
  const rotateZ = useTransform(x, [-150, 0, 150], [-10, 0, 10]);

  // Auto-play video when card is active
  useEffect(() => {
    if (isActive && videoRef.current && driver.videoUrl) {
      videoRef.current.play().catch(() => {
        // Auto-play might be blocked, that's ok
      });
      setIsPlaying(true);
    } else if (!isActive && videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, [isActive, driver.videoUrl]);

  const handleDragEnd = (event: any, info: PanInfo) => {
    const swipeThreshold = 100;
    if (info.offset.x > swipeThreshold) {
      // Swipe right = Request ride
      onRequest(driver.id);
    } else if (info.offset.x < -swipeThreshold) {
      // Swipe left = Skip
      onSkip(driver.id);
    }
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <motion.div
      style={{ x, opacity, rotateZ }}
      drag={isActive ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={handleDragEnd}
      className="relative h-full w-full overflow-hidden rounded-3xl bg-gradient-to-b from-zinc-900 to-black shadow-2xl"
    >
      {/* Video Background */}
      {driver.videoUrl ? (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          loop
          muted={isMuted}
          playsInline
          poster={driver.thumbnailUrl}
          onClick={togglePlayPause}
        >
          <source src={driver.videoUrl} type="video/mp4" />
        </video>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-600 to-pink-600">
          <div className="text-8xl">
            {driver.gender === 'woman' ? '♀️' : driver.gender === 'man' ? '♂️' : '👤'}
          </div>
        </div>
      )}

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />

      {/* Top Controls */}
      <div className="absolute left-0 right-0 top-0 z-10 p-4">
        <div className="flex items-start justify-between">
          {/* Match Score Badge */}
          {match.score > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 px-4 py-2 text-white shadow-lg backdrop-blur-sm"
            >
              <Heart className="h-4 w-4 fill-white" />
              <span className="text-sm font-bold">{Math.round(match.score)}% Match</span>
            </motion.div>
          )}

          {/* Video Controls */}
          {driver.videoUrl && (
            <div className="flex gap-2">
              <button
                onClick={toggleMute}
                className="rounded-full bg-black/50 p-2 text-white backdrop-blur-sm transition-all hover:bg-black/70"
              >
                {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="rounded-full bg-black/50 p-2 text-white backdrop-blur-sm transition-all hover:bg-black/70"
              >
                <Info className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>

        {/* Availability Status */}
        {availability.isOnline && availability.acceptingRides && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-green-500/90 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-sm"
          >
            <div className="h-2 w-2 animate-pulse rounded-full bg-white" />
            Online & Accepting Rides
          </motion.div>
        )}
      </div>

      {/* Bottom Content */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-6">
        {/* Driver Info */}
        <div className="mb-6 space-y-3">
          {/* Name & Verification */}
          <div className="flex items-center gap-3">
            <h2 className="text-4xl font-bold text-white">
              {driver.firstName}
              {driver.lastName && `, ${driver.lastName[0]}.`}
            </h2>
            {driver.isVerified && (
              <div className="rounded-full bg-blue-500 p-1">
                <CheckCircle2 className="h-5 w-5 text-white" />
              </div>
            )}
            {driver.lgbtqFriendly && <span className="text-2xl">🏳️‍🌈</span>}
          </div>

          {/* Pronouns */}
          {driver.pronouns && (
            <p className="text-lg text-white/80">{driver.pronouns}</p>
          )}

          {/* Rating & Stats */}
          <div className="flex items-center gap-4 text-white">
            <div className="flex items-center gap-1">
              <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              <span className="font-bold">{driver.rating.toFixed(1)}</span>
            </div>
            <span className="text-white/60">•</span>
            <span className="text-white/90">{driver.totalRides} rides</span>
          </div>

          {/* Car Info */}
          {driver.carMake && (
            <div className="flex items-center gap-2 text-white/90">
              <Car className="h-4 w-4" />
              <span>
                {driver.carColor} {driver.carMake} {driver.carModel}
              </span>
            </div>
          )}

          {/* Distance & ETA */}
          <div className="flex items-center gap-4 text-white/90">
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span className="text-sm">{availability.distanceFromYou.toFixed(1)} mi away</span>
            </div>
            <span className="text-white/60">•</span>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span className="text-sm">{availability.estimatedArrival} min ETA</span>
            </div>
          </div>

          {/* Match Reasons */}
          {match.reasons.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {match.reasons.slice(0, 3).map((reason, i) => (
                <div
                  key={i}
                  className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm"
                >
                  {reason}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Skip Button */}
          <button
            onClick={() => onSkip(driver.id)}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/30 text-white backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10 active:scale-90"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Request Ride Button (Primary) */}
          <button
            onClick={() => onRequest(driver.id)}
            disabled={!availability.acceptingRides}
            className="flex-1 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-8 py-4 font-bold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            {availability.acceptingRides ? 'Request Ride' : 'Not Accepting Rides'}
          </button>

          {/* Message Button */}
          <button
            onClick={() => onMessage(driver.id)}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/30 text-white backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10 active:scale-90"
          >
            <MessageCircle className="h-6 w-6" />
          </button>
        </div>

        {/* Swipe Hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="mt-4 text-center text-sm text-white/60"
        >
          Swipe right to request • Swipe left to skip
        </motion.div>
      </div>

      {/* Extended Details Overlay */}
      {showDetails && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          className="absolute inset-0 z-20 overflow-y-auto bg-black/95 p-6 backdrop-blur-lg"
        >
          <div className="space-y-6">
            {/* Close Button */}
            <button
              onClick={() => setShowDetails(false)}
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Header */}
            <div>
              <h3 className="text-2xl font-bold text-white">
                About {driver.firstName}
              </h3>
            </div>

            {/* Safety Info */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-white">
                <Shield className="h-5 w-5 text-green-500" />
                <span className="font-semibold">Safety & Verification</span>
              </div>
              <div className="space-y-2 text-sm text-white/80">
                {driver.isVerified && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-500" />
                    <span>ID Verified & Background Checked</span>
                  </div>
                )}
                {driver.lgbtqFriendly && (
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏳️‍🌈</span>
                    <span>LGBTQ+ Friendly Driver</span>
                  </div>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-white/10 p-4">
                <div className="flex items-center gap-2 text-white/60">
                  <Star className="h-4 w-4" />
                  <span className="text-sm">Rating</span>
                </div>
                <p className="mt-1 text-2xl font-bold text-white">
                  {driver.rating.toFixed(1)}
                </p>
              </div>
              <div className="rounded-xl bg-white/10 p-4">
                <div className="flex items-center gap-2 text-white/60">
                  <Car className="h-4 w-4" />
                  <span className="text-sm">Total Rides</span>
                </div>
                <p className="mt-1 text-2xl font-bold text-white">
                  {driver.totalRides}
                </p>
              </div>
            </div>

            {/* Why This Match */}
            {match.reasons.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-white">
                  <Heart className="h-5 w-5 text-pink-500" />
                  <span className="font-semibold">Why this match?</span>
                </div>
                <ul className="space-y-2">
                  {match.reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-white/80">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-pink-500" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
