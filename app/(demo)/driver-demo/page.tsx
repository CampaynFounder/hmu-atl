'use client';

import { useState } from 'react';
import { RiderFeed } from '@/components/feed/rider-feed';
import { FirstRideTutorial } from '@/components/tutorial/first-ride-tutorial';

// Mock data for demo
const mockRiders = [
  {
    rider: {
      id: '1',
      clerkId: 'clerk_rider_1',
      firstName: 'Emma',
      lastName: 'Davis',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
      thumbnailUrl: 'https://via.placeholder.com/720x1280/ec4899/ffffff?text=Emma',
      rating: 4.8,
      isVerified: true,
      gender: 'woman',
      pronouns: 'she/her',
      lgbtqFriendly: true,
    },
    request: {
      id: 'req_1',
      pickupAddress: '123 Peachtree St NE, Atlanta, GA 30303',
      pickupLat: 33.7589,
      pickupLng: -84.3907,
      dropoffAddress: '456 Ponce de Leon Ave NE, Atlanta, GA 30308',
      dropoffLat: 33.7716,
      dropoffLng: -84.3638,
      stops: [],
      offerAmount: 18.50,
      distance: 3.2,
      estimatedDuration: 12,
      note: 'I have one small suitcase. Please text when you arrive!',
      requestedAt: new Date(),
    },
    match: {
      score: 94,
      reasons: [
        'LGBTQ+ friendly rider',
        'Excellent rating (4.8+)',
        'Only 0.5 miles from pickup',
        'Good offer ($18.50 for 3.2 mi)',
      ],
      distanceToPickup: 0.5,
      estimatedETA: 3,
    },
  },
  {
    rider: {
      id: '2',
      clerkId: 'clerk_rider_2',
      firstName: 'Jordan',
      lastName: 'Taylor',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
      thumbnailUrl: 'https://via.placeholder.com/720x1280/a855f7/ffffff?text=Jordan',
      rating: 4.9,
      isVerified: true,
      gender: 'non-binary',
      pronouns: 'they/them',
      lgbtqFriendly: true,
    },
    request: {
      id: 'req_2',
      pickupAddress: '789 North Ave NE, Atlanta, GA 30308',
      pickupLat: 33.7716,
      pickupLng: -84.3826,
      dropoffAddress: '321 14th St NW, Atlanta, GA 30318',
      dropoffLat: 33.7890,
      dropoffLng: -84.4056,
      stops: [
        {
          address: '555 Memorial Dr SE, Atlanta, GA 30312',
          lat: 33.7471,
          lng: -84.3688,
        },
      ],
      offerAmount: 25.00,
      distance: 4.8,
      estimatedDuration: 18,
      note: 'Quick stop to pick up a friend. Will be ready in 10 minutes!',
      requestedAt: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago
    },
    match: {
      score: 89,
      reasons: [
        'LGBTQ+ friendly rider',
        'Top rated (4.9+)',
        'Generous offer ($25 for 4.8 mi)',
      ],
      distanceToPickup: 1.2,
      estimatedETA: 6,
    },
  },
  {
    rider: {
      id: '3',
      clerkId: 'clerk_rider_3',
      firstName: 'Michael',
      lastName: 'Brown',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
      thumbnailUrl: 'https://via.placeholder.com/720x1280/8b5cf6/ffffff?text=Michael',
      rating: 4.7,
      isVerified: true,
      gender: 'man',
      pronouns: 'he/him',
      lgbtqFriendly: false,
    },
    request: {
      id: 'req_3',
      pickupAddress: '234 West Peachtree St NW, Atlanta, GA 30303',
      pickupLat: 33.7625,
      pickupLng: -84.3883,
      dropoffAddress: '890 Spring St NW, Atlanta, GA 30308',
      dropoffLat: 33.7808,
      dropoffLng: -84.3868,
      stops: [],
      offerAmount: 15.00,
      distance: 1.8,
      estimatedDuration: 8,
      requestedAt: new Date(Date.now() - 2 * 60 * 1000), // 2 min ago
    },
    match: {
      score: 76,
      reasons: [
        'Good rating (4.7+)',
        'Short distance ride',
        'Close to your location',
      ],
      distanceToPickup: 0.9,
      estimatedETA: 5,
    },
  },
];

export default function DriverDemoPage() {
  const [showTutorial, setShowTutorial] = useState(false);

  return (
    <div className="h-screen w-screen overflow-hidden bg-black">
      {/* Main Feed */}
      <RiderFeed initialRequests={mockRiders} />

      {/* Tutorial */}
      <FirstRideTutorial
        isOpen={showTutorial}
        onComplete={() => setShowTutorial(false)}
        onSkip={() => setShowTutorial(false)}
        userType="driver"
      />

      {/* Demo Controls */}
      <div className="fixed bottom-4 left-4 z-[60] flex gap-2">
        <button
          onClick={() => setShowTutorial(true)}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black shadow-lg"
        >
          Show Tutorial
        </button>
      </div>
    </div>
  );
}
