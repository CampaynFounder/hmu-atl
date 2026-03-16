// Pending Account Review Page
// Shown to users with account_status = 'pending_activation'

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { UserButton } from '@clerk/nextjs';

export default async function PendingPage() {
  const user = await getCurrentUser();

  // Redirect if not authenticated
  if (!user) {
    redirect('/sign-in');
  }

  // Redirect if already active (shouldn't happen, but safety check)
  if (user.account_status === 'active') {
    redirect('/dashboard');
  }

  // Redirect if suspended/banned
  if (user.account_status === 'suspended' || user.account_status === 'banned') {
    redirect('/account-status');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 px-4">
      <div className="max-w-md w-full bg-zinc-800/50 backdrop-blur-sm border border-zinc-700 rounded-2xl p-8 shadow-2xl">
        <div className="flex justify-end mb-6">
          <UserButton />
        </div>

        <div className="text-center space-y-6">
          {/* Icon */}
          <div className="mx-auto w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center">
            <svg
              className="w-10 h-10 text-yellow-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          {/* Heading */}
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">
              Your Account is Under Review
            </h1>
            <p className="text-zinc-400 text-sm">
              Our team is reviewing your video introduction and profile information.
            </p>
          </div>

          {/* Details */}
          <div className="bg-zinc-900/50 border border-zinc-700 rounded-lg p-4 text-left space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 bg-blue-500/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg
                  className="w-3 h-3 text-blue-500"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <p className="text-white text-sm font-medium">Profile Submitted</p>
                <p className="text-zinc-500 text-xs mt-0.5">
                  We've received your information
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-5 h-5 bg-yellow-500/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg
                  className="w-3 h-3 text-yellow-500"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <p className="text-white text-sm font-medium">Under Review</p>
                <p className="text-zinc-500 text-xs mt-0.5">
                  Typically takes 24-48 hours
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 opacity-40">
              <div className="w-5 h-5 bg-zinc-700 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg
                  className="w-3 h-3 text-zinc-500"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                </svg>
              </div>
              <div>
                <p className="text-zinc-400 text-sm font-medium">Account Activated</p>
                <p className="text-zinc-600 text-xs mt-0.5">
                  You'll receive an email when approved
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-zinc-700">
            <p className="text-zinc-500 text-xs">
              Questions?{' '}
              <a
                href="mailto:support@hmu-atl.com"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Contact Support
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
