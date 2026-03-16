'use client';

// Problem Section - Shows pain points and solutions
import { motion } from 'framer-motion';
import { XCircle, CheckCircle } from 'lucide-react';

export function ProblemSection() {
  const problems = [
    {
      problem: 'Lost in 200+ comments',
      solution: 'Direct matching in seconds',
    },
    {
      problem: 'No payment protection',
      solution: 'Secure escrow payment',
    },
    {
      problem: 'Unreliable drivers',
      solution: 'Verified, rated drivers',
    },
  ];

  return (
    <section className="py-24 bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            "Finding rides in Atlanta Facebook groups is{' '}
            <span className="text-orange-600">chaos</span>"
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            We built HMU Cash Ride to fix everything that's broken about finding rides on social media.
          </p>
        </motion.div>

        {/* Problem/Solution Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {problems.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow"
            >
              {/* Problem */}
              <div className="flex items-start gap-3 mb-6 pb-6 border-b border-gray-100">
                <XCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-1" />
                <p className="text-gray-600 font-medium">{item.problem}</p>
              </div>

              {/* Solution */}
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                <p className="text-gray-900 font-semibold">{item.solution}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
