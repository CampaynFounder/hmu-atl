'use client';

import { useState } from 'react';
import { DriverFeed } from '@/components/feed/driver-feed';
import { RideRequestComposer } from '@/components/rides/ride-request-composer';
import { FirstRideTutorial } from '@/components/tutorial/first-ride-tutorial';

// Mock data for demo
const mockDrivers = [
  {
    driver: {
      id: '1',
      clerkId: 'clerk_demo_1',
      firstName: 'Sarah',
      lastName: 'Johnson',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      thumbnailUrl: 'https://via.placeholder.com/720x1280/a855f7/ffffff?text=Sarah',
      rating: 4.9,
      totalRides: 247,
      isVerified: true,
      gender: 'woman',
      pronouns: 'she/her',
      lgbtqFriendly: true,
      carMake: 'Tesla',
      carModel: 'Model 3',
      carColor: 'White',
      licensePlate: 'ABC123',
    },
    availability: {
      isOnline: true,
      currentLocation: 'Midtown Atlanta',
      distanceFromYou: 0.8,
      estimatedArrival: 4,
      acceptingRides: true,
    },
    match: {
      score: 95,
      reasons: [
        'LGBTQ+ friendly driver',
        'Excellent rating (4.9+)',
        'Very close to you',
        'Preferred gender match',
      ],
    },
  },
  {
    driver: {
      id: '2',
      clerkId: 'clerk_demo_2',
      firstName: 'Marcus',
      lastName: 'Williams',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      thumbnailUrl: 'https://via.placeholder.com/720x1280/ec4899/ffffff?text=Marcus',
      rating: 4.8,
      totalRides: 189,
      isVerified: true,
      gender: 'man',
      pronouns: 'he/him',
      lgbtqFriendly: true,
      carMake: 'Honda',
      carModel: 'Accord',
      carColor: 'Blue',
      licensePlate: 'XYZ789',
    },
    availability: {
      isOnline: true,
      currentLocation: 'Buckhead',
      distanceFromYou: 1.2,
      estimatedArrival: 6,
      acceptingRides: true,
    },
    match: {
      score: 88,
      reasons: [
        'LGBTQ+ friendly driver',
        'Great rating (4.8+)',
        'Verified driver',
      ],
    },
  },
  {
    driver: {
      id: '3',
      clerkId: 'clerk_demo_3',
      firstName: 'Alex',
      lastName: 'Chen',
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
      thumbnailUrl: 'https://via.placeholder.com/720x1280/8b5cf6/ffffff?text=Alex',
      rating: 4.95,
      totalRides: 312,
      isVerified: true,
      gender: 'non-binary',
      pronouns: 'they/them',
      lgbtqFriendly: true,
      carMake: 'Toyota',
      carModel: 'Prius',
      carColor: 'Silver',
      licensePlate: 'DEF456',
    },
    availability: {
      isOnline: true,
      currentLocation: 'Virginia Highland',
      distanceFromYou: 1.5,
      estimatedArrival: 7,
      acceptingRides: true,
    },
    match: {
      score: 92,
      reasons: [
        'LGBTQ+ friendly driver',
        'Top rated driver (4.9+)',
        'Most experienced (312 rides)',
      ],
    },
  },
];

export default function RiderDemoPage() {
  const [showComposer, setShowComposer] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  const handleRideRequest = (request: any) => {
    console.log('Ride requested:', request);
    alert('Ride request submitted! (Demo mode - not actually sent)');
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-black">
      {/* Main Feed */}
      <DriverFeed
        initialDrivers={mockDrivers}
        onRequestRide={() => setShowComposer(true)}
      />

      {/* Ride Request Composer */}
      <RideRequestComposer
        isOpen={showComposer}
        onClose={() => setShowComposer(false)}
        onSubmit={handleRideRequest}
      />

      {/* Tutorial */}
      <FirstRideTutorial
        isOpen={showTutorial}
        onComplete={() => setShowTutorial(false)}
        onSkip={() => setShowTutorial(false)}
        userType="rider"
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
