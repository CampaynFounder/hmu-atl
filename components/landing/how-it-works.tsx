'use client';

// How It Works - 3-step visual process
import { motion } from 'framer-motion';
import { MapPin, Users, Star } from 'lucide-react';

export function HowItWorks() {
  const steps = [
    {
      number: '01',
      title: 'Post or Find a Ride',
      description: 'Share where you\'re going or browse rides heading your way',
      icon: MapPin,
      color: 'from-orange-500 to-orange-600',
    },
    {
      number: '02',
      title: 'Match Instantly',
      description: 'Connect with drivers or riders in your neighborhood',
      icon: Users,
      color: 'from-amber-500 to-orange-500',
    },
    {
      number: '03',
      title: 'Ride & Rate',
      description: 'Safe, secure rides with payment held in escrow until completion',
      icon: Star,
      color: 'from-yellow-500 to-amber-500',
    },
  ];

  return (
    <section id="how-it-works" className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            How It Works
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Three simple steps to affordable, community-driven rides
          </p>
        </motion.div>

        {/* Steps */}
        <div className="relative">
          {/* Connection line (desktop only) */}
          <div className="hidden md:block absolute top-24 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-200 via-amber-200 to-yellow-200 -z-10" />

          <div className="grid md:grid-cols-3 gap-12">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                className="relative"
              >
                {/* Number badge */}
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 bg-white border-4 border-gray-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-bold text-gray-400">{step.number}</span>
                </div>

                {/* Card */}
                <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-8 text-center border border-gray-100 hover:border-orange-200 transition-colors">
                  {/* Icon */}
                  <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${step.color} mb-6 shadow-lg`}>
                    <step.icon className="w-8 h-8 text-white" />
                  </div>

                  {/* Content */}
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">
                    {step.title}
                  </h3>
                  <p className="text-gray-600 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
