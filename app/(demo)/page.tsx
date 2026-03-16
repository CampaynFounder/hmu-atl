'use client';

import Link from 'next/link';
import { Car, User, Sparkles } from 'lucide-react';

export default function DemoLandingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-600 via-pink-500 to-purple-700 p-4">
      <div className="w-full max-w-4xl space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="mb-4 text-6xl font-bold text-white">HMU ATL</h1>
          <p className="text-xl text-white/90">Community Rideshare Demo</p>
          <p className="mt-2 text-sm text-white/70">
            Experience the mobile-first, feed-based UX
          </p>
        </div>

        {/* Demo Cards */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Onboarding Demo */}
          <Link
            href="/onboarding"
            className="group rounded-3xl bg-white/10 p-8 backdrop-blur-lg transition-all hover:scale-105 hover:bg-white/20"
          >
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-gradient-to-br from-purple-400 to-pink-400 p-6">
                <Sparkles className="h-12 w-12 text-white" />
              </div>
            </div>
            <h2 className="mb-2 text-center text-2xl font-bold text-white">
              Rider Onboarding
            </h2>
            <p className="text-center text-sm text-white/80">
              4-step wizard with video recording, safety preferences, and payment setup
            </p>
            <div className="mt-6 space-y-2 text-xs text-white/70">
              <div>✓ Profile creation</div>
              <div>✓ Hybrid video recorder</div>
              <div>✓ Safety preferences</div>
              <div>✓ Payment setup</div>
            </div>
          </Link>

          {/* Rider Demo */}
          <Link
            href="/rider"
            className="group rounded-3xl bg-white/10 p-8 backdrop-blur-lg transition-all hover:scale-105 hover:bg-white/20"
          >
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 p-6">
                <User className="h-12 w-12 text-white" />
              </div>
            </div>
            <h2 className="mb-2 text-center text-2xl font-bold text-white">
              Rider Experience
            </h2>
            <p className="text-center text-sm text-white/80">
              Browse available drivers and request rides with TikTok-style feed
            </p>
            <div className="mt-6 space-y-2 text-xs text-white/70">
              <div>✓ Swipeable driver cards</div>
              <div>✓ Video profiles</div>
              <div>✓ Match scoring</div>
              <div>✓ Ride request composer</div>
            </div>
          </Link>

          {/* Driver Demo */}
          <Link
            href="/driver"
            className="group rounded-3xl bg-white/10 p-8 backdrop-blur-lg transition-all hover:scale-105 hover:bg-white/20"
          >
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-gradient-to-br from-green-400 to-emerald-400 p-6">
                <Car className="h-12 w-12 text-white" />
              </div>
            </div>
            <h2 className="mb-2 text-center text-2xl font-bold text-white">
              Driver Experience
            </h2>
            <p className="text-center text-sm text-white/80">
              View ride requests and accept/counter offers with swipe gestures
            </p>
            <div className="mt-6 space-y-2 text-xs text-white/70">
              <div>✓ Swipeable rider cards</div>
              <div>✓ Ride details</div>
              <div>✓ Safety matching</div>
              <div>✓ Accept/counter/skip</div>
            </div>
          </Link>
        </div>

        {/* Instructions */}
        <div className="rounded-3xl bg-white/10 p-6 backdrop-blur-lg">
          <h3 className="mb-4 text-center text-xl font-bold text-white">
            📱 Best viewed on mobile or narrow browser window
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-white/5 p-4">
              <div className="mb-2 text-center text-2xl">👆</div>
              <p className="text-center text-sm text-white/80">
                <strong className="text-white">Swipe</strong> right to accept/request
              </p>
            </div>
            <div className="rounded-xl bg-white/5 p-4">
              <div className="mb-2 text-center text-2xl">👈</div>
              <p className="text-center text-sm text-white/80">
                <strong className="text-white">Swipe</strong> left to skip
              </p>
            </div>
            <div className="rounded-xl bg-white/5 p-4">
              <div className="mb-2 text-center text-2xl">🎥</div>
              <p className="text-center text-sm text-white/80">
                <strong className="text-white">Tap</strong> videos to play/pause
              </p>
            </div>
          </div>
        </div>

        {/* Tech Stack */}
        <div className="text-center text-sm text-white/60">
          Built with Next.js 16 • Framer Motion • TailwindCSS • Stripe • Neon Postgres
        </div>
      </div>
    </div>
  );
}
