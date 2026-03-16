// Footer Component
import Link from 'next/link';
import { Instagram, Twitter, Facebook } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-gray-900 text-white py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <h3 className="text-2xl font-bold mb-4 bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
              HMU Cash Ride
            </h3>
            <p className="text-gray-400 mb-4">
              Metro Atlanta's peer-to-peer ride network. Skip the surge. Build community.
            </p>
            <div className="flex gap-4">
              <a
                href="https://instagram.com/hmucashride"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center hover:bg-orange-500 transition-colors"
              >
                <Instagram className="w-5 h-5" />
              </a>
              <a
                href="https://twitter.com/hmucashride"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center hover:bg-orange-500 transition-colors"
              >
                <Twitter className="w-5 h-5" />
              </a>
              <a
                href="https://facebook.com/hmucashride"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center hover:bg-orange-500 transition-colors"
              >
                <Facebook className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* For Drivers */}
          <div>
            <h4 className="font-semibold mb-4">For Drivers</h4>
            <ul className="space-y-2 text-gray-400">
              <li>
                <Link href="/drive" className="hover:text-orange-400 transition-colors">
                  Start Driving
                </Link>
              </li>
              <li>
                <Link href="/drive#earnings" className="hover:text-orange-400 transition-colors">
                  Earnings Calculator
                </Link>
              </li>
              <li>
                <Link href="/drive#requirements" className="hover:text-orange-400 transition-colors">
                  Requirements
                </Link>
              </li>
            </ul>
          </div>

          {/* For Riders */}
          <div>
            <h4 className="font-semibold mb-4">For Riders</h4>
            <ul className="space-y-2 text-gray-400">
              <li>
                <Link href="/ride" className="hover:text-orange-400 transition-colors">
                  Get a Ride
                </Link>
              </li>
              <li>
                <Link href="/ride#pricing" className="hover:text-orange-400 transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/ride#safety" className="hover:text-orange-400 transition-colors">
                  Safety
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-gray-400 text-sm">
            © 2026 HMU Cash Ride. Launching Q2 2026 • Metro Atlanta
          </p>
          <div className="flex gap-6 text-sm text-gray-400">
            <Link href="/privacy" className="hover:text-orange-400 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-orange-400 transition-colors">
              Terms of Service
            </Link>
            <Link href="/contact" className="hover:text-orange-400 transition-colors">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
