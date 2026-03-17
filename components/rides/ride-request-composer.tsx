'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  Navigation,
  DollarSign,
  MessageSquare,
  X,
  Plus,
  Minus,
  Clock,
  Calendar,
  ChevronDown,
} from 'lucide-react';

interface Location {
  address: string;
  latitude: number;
  longitude: number;
}

interface Stop {
  address: string;
  latitude: number;
  longitude: number;
  note?: string;
}

interface RideRequestComposerProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (request: RideRequest) => void;
  preSelectedDriverId?: string;
}

interface RideRequest {
  pickup: Location;
  dropoff: Location;
  stops: Stop[];
  offerAmount: number;
  note?: string;
  scheduledFor?: Date;
}

export function RideRequestComposer({
  isOpen,
  onClose,
  onSubmit,
  preSelectedDriverId,
}: RideRequestComposerProps) {
  const [step, setStep] = useState<'locations' | 'stops' | 'pricing' | 'details'>('locations');
  const [pickup, setPickup] = useState<Location | null>(null);
  const [dropoff, setDropoff] = useState<Location | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [offerAmount, setOfferAmount] = useState<number>(0);
  const [suggestedPrice, setSuggestedPrice] = useState<number>(0);
  const [note, setNote] = useState('');
  const [scheduledFor, setScheduledFor] = useState<Date | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);

  const pickupInputRef = useRef<HTMLInputElement>(null);
  const dropoffInputRef = useRef<HTMLInputElement>(null);

  // Initialize Google Places Autocomplete
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    // TODO: Initialize Google Places Autocomplete on inputs
    // const pickupAutocomplete = new google.maps.places.Autocomplete(pickupInputRef.current);
    // const dropoffAutocomplete = new google.maps.places.Autocomplete(dropoffInputRef.current);
  }, [isOpen]);

  // Calculate suggested price when locations change
  useEffect(() => {
    if (pickup && dropoff) {
      calculateSuggestedPrice();
    }
  }, [pickup, dropoff, stops]);

  const calculateSuggestedPrice = async () => {
    // DEMO: Use mock pricing for demo
    // In production, this would call the API
    const mockPrice = 15 + Math.floor(Math.random() * 20);
    setSuggestedPrice(mockPrice);
    setOfferAmount(mockPrice);

    // Commented out for demo - uncomment when API is ready
    /*
    try {
      const res = await fetch('/api/rides/price-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup,
          dropoff,
          stops,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuggestedPrice(data.suggestedPrice);
        setOfferAmount(data.suggestedPrice);
      }
    } catch (error) {
      console.error('Failed to get price estimate:', error);
    }
    */
  };

  const handleAddStop = () => {
    setStops([...stops, { address: '', latitude: 0, longitude: 0 }]);
  };

  const handleRemoveStop = (index: number) => {
    setStops(stops.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!pickup || !dropoff) return;

    const request: RideRequest = {
      pickup,
      dropoff,
      stops,
      offerAmount,
      note: note || undefined,
      scheduledFor: scheduledFor || undefined,
    };

    onSubmit(request);
    onClose();
  };

  const canProceed = () => {
    switch (step) {
      case 'locations':
        return pickup && dropoff;
      case 'stops':
        return true; // Optional step
      case 'pricing':
        return offerAmount > 0;
      case 'details':
        return true; // Optional step
      default:
        return false;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          />

          {/* Composer Modal */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl dark:bg-zinc-900"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-xl font-bold">Request a Ride</h2>
              <button
                onClick={onClose}
                className="rounded-full p-2 transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Progress Steps */}
            <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-3 dark:border-zinc-800">
              {['locations', 'stops', 'pricing', 'details'].map((s, i) => (
                <div
                  key={s}
                  className={`flex-1 text-center text-xs font-medium transition-colors ${
                    step === s
                      ? 'text-purple-600'
                      : i < ['locations', 'stops', 'pricing', 'details'].indexOf(step)
                      ? 'text-green-600'
                      : 'text-gray-400'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </div>
              ))}
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Step 1: Locations */}
              {step === 'locations' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Where are you going?</h3>

                  {/* Pickup Input */}
                  <div>
                    <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <div className="rounded-full bg-green-500 p-1">
                        <MapPin className="h-4 w-4 text-white" />
                      </div>
                      Pickup Location
                    </label>
                    <input
                      ref={pickupInputRef}
                      type="text"
                      placeholder="Enter pickup address"
                      className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white dark:placeholder-gray-400"
                    />
                  </div>

                  {/* Dropoff Input */}
                  <div>
                    <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <div className="rounded-full bg-red-500 p-1">
                        <Navigation className="h-4 w-4 text-white" />
                      </div>
                      Dropoff Location
                    </label>
                    <input
                      ref={dropoffInputRef}
                      type="text"
                      placeholder="Enter destination address"
                      className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white dark:placeholder-gray-400"
                    />
                  </div>

                  {/* Current Location Button */}
                  <button className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-3 font-medium text-purple-600 transition-all hover:border-purple-500 dark:border-zinc-700">
                    <Navigation className="h-5 w-5" />
                    Use Current Location
                  </button>
                </div>
              )}

              {/* Step 2: Stops */}
              {step === 'stops' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Add stops (optional)</h3>
                    <span className="text-sm text-muted-foreground">
                      {stops.length} {stops.length === 1 ? 'stop' : 'stops'}
                    </span>
                  </div>

                  {/* Stops List */}
                  {stops.map((stop, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <input
                            type="text"
                            placeholder={`Stop ${index + 1} address`}
                            value={stop.address}
                            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white dark:placeholder-gray-400"
                          />
                        </div>
                        <button
                          onClick={() => handleRemoveStop(index)}
                          className="rounded-full p-3 text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          <Minus className="h-5 w-5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="Note for this stop (optional)"
                        value={stop.note || ''}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white dark:placeholder-gray-400"
                      />
                    </div>
                  ))}

                  {/* Add Stop Button */}
                  <button
                    onClick={handleAddStop}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-3 font-medium text-purple-600 transition-all hover:border-purple-500 dark:border-zinc-700"
                  >
                    <Plus className="h-5 w-5" />
                    Add Stop
                  </button>
                </div>
              )}

              {/* Step 3: Pricing */}
              {step === 'pricing' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold">How much are you offering?</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Set your price. Drivers can accept or counter-offer.
                    </p>
                  </div>

                  {/* Suggested Price */}
                  {suggestedPrice > 0 && (
                    <div className="rounded-xl bg-purple-50 p-4 dark:bg-purple-950">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                            Suggested Price
                          </p>
                          <p className="mt-1 text-xs text-purple-700 dark:text-purple-300">
                            Based on distance and current demand
                          </p>
                        </div>
                        <div className="text-2xl font-bold text-purple-600">
                          ${suggestedPrice.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Price Slider */}
                  <div>
                    <div className="mb-4 flex items-end justify-between">
                      <label className="text-sm font-medium">Your Offer</label>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-6 w-6 text-green-600" />
                        <input
                          type="number"
                          value={offerAmount}
                          onChange={(e) => setOfferAmount(parseFloat(e.target.value) || 0)}
                          className="w-20 rounded-lg border border-gray-300 bg-white px-2 py-1 text-right text-2xl font-bold text-gray-900 focus:border-purple-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                          step="0.50"
                          min="0"
                        />
                      </div>
                    </div>
                    <input
                      type="range"
                      value={offerAmount}
                      onChange={(e) => setOfferAmount(parseFloat(e.target.value))}
                      min={suggestedPrice * 0.5}
                      max={suggestedPrice * 1.5}
                      step="0.50"
                      className="w-full"
                    />
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>${(suggestedPrice * 0.5).toFixed(2)}</span>
                      <span>${(suggestedPrice * 1.5).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Price Tips */}
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p>
                      💡 <strong>Tip:</strong> Higher offers get accepted faster
                    </p>
                    <p>
                      ⚡ <strong>Note:</strong> You won't be charged until the ride is complete
                    </p>
                  </div>
                </div>
              )}

              {/* Step 4: Details */}
              {step === 'details' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold">Additional details</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Let drivers know anything special about your ride
                    </p>
                  </div>

                  {/* Schedule Toggle */}
                  <div>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isScheduled}
                        onChange={(e) => setIsScheduled(e.target.checked)}
                        className="h-5 w-5 rounded border-gray-300 text-purple-600 focus:ring-2 focus:ring-purple-500/20"
                      />
                      <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-purple-600" />
                        <span className="font-medium">Schedule for later</span>
                      </div>
                    </label>

                    {/* Date/Time Picker */}
                    {isScheduled && (
                      <div className="mt-3 rounded-xl border border-gray-300 p-4 dark:border-zinc-700">
                        <input
                          type="datetime-local"
                          onChange={(e) => setScheduledFor(new Date(e.target.value))}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-purple-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                          min={new Date().toISOString().slice(0, 16)}
                        />
                      </div>
                    )}
                  </div>

                  {/* Note */}
                  <div>
                    <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <MessageSquare className="h-4 w-4" />
                      Note for driver (optional)
                    </label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g., I have luggage, Please text when you arrive, etc."
                      rows={3}
                      maxLength={200}
                      className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white dark:placeholder-gray-400"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {note.length}/200 characters
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="sticky bottom-0 border-t border-gray-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex gap-3">
                {step !== 'locations' && (
                  <button
                    onClick={() => {
                      const steps = ['locations', 'stops', 'pricing', 'details'];
                      const currentIndex = steps.indexOf(step);
                      setStep(steps[currentIndex - 1] as any);
                    }}
                    className="flex-1 rounded-xl border-2 border-gray-300 px-6 py-3 font-semibold transition-all hover:border-gray-400 dark:border-zinc-700"
                  >
                    Back
                  </button>
                )}

                {step !== 'details' ? (
                  <button
                    onClick={() => {
                      const steps = ['locations', 'stops', 'pricing', 'details'];
                      const currentIndex = steps.indexOf(step);
                      setStep(steps[currentIndex + 1] as any);
                    }}
                    disabled={!canProceed()}
                    className="flex-1 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 font-bold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={!canProceed()}
                    className="flex-1 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 font-bold text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                  >
                    {isScheduled ? 'Schedule Ride' : 'Request Ride'}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
