'use client';

// Soft blocker shown when a driver taps the HMU button on a driver profile page.
// Two variants:
//   - 'own':   you can't book yourself — pick another driver
//   - 'other': booking is for riders — we'll add a dual-role flow in PR 2
//
// Both variants route the driver to /driver/feed where they can see open
// ride requests in their area. That's the most useful destination for a
// logged-in driver standing in front of a booking blocker.

interface Props {
  open: boolean;
  variant: 'own' | 'other';
  driverDisplayName: string;
  onClose: () => void;
}

export function DriverBlockerModal({ open, variant, driverDisplayName, onClose }: Props) {
  if (!open) return null;

  const title = variant === 'own' ? "You can't book yourself" : 'Booking is for riders';
  const body = variant === 'own'
    ? "This is your own driver profile. Check your ride request feed instead — real rides to accept."
    : `You're signed in as a driver. To book ${driverDisplayName}, you'll need a rider account — we'll add one to the app soon so you don't have to log out. In the meantime, check your ride request feed.`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="driver-blocker-title"
    >
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-[#141414] border border-white/10 p-5 shadow-2xl">
        <h2 id="driver-blocker-title" className="text-lg font-bold text-white mb-2">
          {title}
        </h2>
        <p className="text-sm text-neutral-400 leading-relaxed mb-5">{body}</p>
        <div className="flex flex-col gap-2">
          <a
            href="/driver/feed"
            className="w-full py-3 rounded-full bg-[#00E676] text-black font-bold text-center text-sm"
            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'rgba(0,0,0,0)' }}
          >
            Browse Ride Requests
          </a>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-full border border-white/10 text-neutral-300 font-medium text-sm"
            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'rgba(0,0,0,0)' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
