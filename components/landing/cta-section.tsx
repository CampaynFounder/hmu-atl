'use client';

// CTA Section - Final conversion point with waitlist form
import { motion } from 'framer-motion';
import { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';

export function CTASection() {
  const [email, setEmail] = useState('');
  const [userType, setUserType] = useState<'driver' | 'rider' | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !userType) return;

    setLoading(true);

    // TODO: Connect to Airtable or your waitlist backend
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API call

    setLoading(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <section id="waitlist" className="py-24 bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="bg-white rounded-3xl p-12 shadow-2xl">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                You're on the list!
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                We'll notify you as soon as HMU Cash Ride launches in Metro Atlanta.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a
                  href="https://instagram.com/hmucashride"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-600 text-white font-semibold rounded-full hover:shadow-lg transition-all"
                >
                  Follow on Instagram
                </a>
                <a
                  href="https://twitter.com/hmucashride"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center px-6 py-3 bg-gray-900 text-white font-semibold rounded-full hover:shadow-lg transition-all"
                >
                  Follow on Twitter
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    );
  }

  return (
    <section id="waitlist" className="py-24 bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Ready to Skip the Surge?
          </h2>
          <p className="text-xl text-white/90 max-w-2xl mx-auto">
            Join the waitlist and be the first to ride when we launch in Q2 2026
          </p>
        </motion.div>

        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white rounded-3xl p-8 shadow-2xl max-w-2xl mx-auto"
        >
          {/* User Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              I want to...
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setUserType('driver')}
                className={`p-6 rounded-2xl border-2 transition-all ${
                  userType === 'driver'
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 hover:border-orange-300'
                }`}
              >
                <div className="text-4xl mb-2">🚗</div>
                <div className="font-bold text-gray-900">Drive & Earn</div>
                <div className="text-sm text-gray-600">Keep 85% of fares</div>
              </button>
              <button
                type="button"
                onClick={() => setUserType('rider')}
                className={`p-6 rounded-2xl border-2 transition-all ${
                  userType === 'rider'
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 hover:border-orange-300'
                }`}
              >
                <div className="text-4xl mb-2">🙋</div>
                <div className="font-bold text-gray-900">Get Rides</div>
                <div className="text-sm text-gray-600">Save up to 60%</div>
              </button>
            </div>
          </div>

          {/* Email Input */}
          <div className="mb-6">
            <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full px-6 py-4 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:ring-0 outline-none transition-colors text-lg"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!email || !userType || loading}
            className="w-full bg-gradient-to-r from-orange-500 to-amber-600 text-white font-bold text-lg px-8 py-5 rounded-xl hover:shadow-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Joining...
              </>
            ) : (
              <>
                Join the Waitlist
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>

          <p className="text-center text-sm text-gray-500 mt-4">
            No spam. Just updates on our launch progress.
          </p>
        </motion.form>
      </div>
    </section>
  );
}
