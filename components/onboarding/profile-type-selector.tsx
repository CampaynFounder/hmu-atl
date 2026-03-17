'use client';

import { motion } from 'framer-motion';
import { Car, MapPin } from 'lucide-react';

interface ProfileTypeSelectorProps {
  onSelect: (type: 'rider' | 'driver') => void;
}

export function ProfileTypeSelector({ onSelect }: ProfileTypeSelectorProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm space-y-8"
      >
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black text-white">Welcome to HMU ATL</h1>
          <p className="text-zinc-400">Are you riding or driving?</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => onSelect('rider')}
            className="group w-full rounded-2xl border border-zinc-700 bg-zinc-900 p-6 text-left transition-all hover:border-purple-500 hover:bg-zinc-800 active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/20 group-hover:bg-purple-500/30 transition-colors">
                <MapPin className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <p className="font-bold text-white text-lg">I need a ride</p>
                <p className="text-sm text-zinc-400">Find drivers in your area</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => onSelect('driver')}
            className="group w-full rounded-2xl border border-zinc-700 bg-zinc-900 p-6 text-left transition-all hover:border-[#00E676] hover:bg-zinc-800 active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#00E676]/20 group-hover:bg-[#00E676]/30 transition-colors">
                <Car className="h-6 w-6 text-[#00E676]" />
              </div>
              <div>
                <p className="font-bold text-white text-lg">I want to drive</p>
                <p className="text-sm text-zinc-400">Set your price, your schedule</p>
              </div>
            </div>
          </button>
        </div>

        <p className="text-center text-xs text-zinc-600">
          You can always add the other role later in Settings
        </p>
      </motion.div>
    </div>
  );
}
