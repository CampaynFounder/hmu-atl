'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-black/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="text-xl font-bold text-white">
              HMU ATL
            </Link>

            {/* Hamburger Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="fixed top-16 left-0 right-0 z-30 bg-black/95 backdrop-blur-md border-b border-white/10"
          >
            <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <ul className="space-y-4">
                <li>
                  <Link
                    href="/"
                    onClick={() => setIsMenuOpen(false)}
                    className="block px-4 py-3 rounded-lg text-white hover:bg-white/10 transition-colors"
                  >
                    Home
                  </Link>
                </li>
                <li>
                  <Link
                    href="/sign-in"
                    onClick={() => setIsMenuOpen(false)}
                    className="block px-4 py-3 rounded-lg text-white hover:bg-purple-500/20 bg-purple-500/10 border border-purple-500/30 transition-colors font-semibold"
                  >
                    Sign In
                  </Link>
                </li>
                <li>
                  <Link
                    href="/rider"
                    onClick={() => setIsMenuOpen(false)}
                    className="block px-4 py-3 rounded-lg text-white hover:bg-white/10 transition-colors"
                  >
                    Rider Demo
                  </Link>
                </li>
                <li>
                  <Link
                    href="/driver"
                    onClick={() => setIsMenuOpen(false)}
                    className="block px-4 py-3 rounded-lg text-white hover:bg-white/10 transition-colors"
                  >
                    Driver Demo
                  </Link>
                </li>
              </ul>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
