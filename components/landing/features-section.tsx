'use client';

// Features Section - Bento Grid Layout
import { motion } from 'framer-motion';
import { Navigation, Shield, Award, TrendingUp } from 'lucide-react';

export function FeaturesSection() {
  const features = [
    {
      title: 'Real-time GPS Tracking',
      description: 'Track your ride from pickup to dropoff. Share your location with friends for added safety.',
      icon: Navigation,
      span: 'md:col-span-2 md:row-span-2',
      gradient: 'from-orange-500 to-amber-600',
    },
    {
      title: 'Secure Payment Escrow',
      description: 'Money held safely until ride completes',
      icon: Shield,
      span: 'md:col-span-1',
      gradient: 'from-amber-500 to-yellow-500',
    },
    {
      title: 'OG Status Badges',
      description: '10+ rides earns you OG status',
      icon: Award,
      span: 'md:col-span-1',
      gradient: 'from-orange-600 to-red-500',
    },
    {
      title: 'Chill Score Ratings',
      description: 'Community-powered trust system. Rate every ride.',
      icon: TrendingUp,
      span: 'md:col-span-2',
      gradient: 'from-yellow-500 to-orange-500',
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
            Built for Safety & Community
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Everything you need for safe, affordable rides with your neighbors
          </p>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid md:grid-cols-3 gap-6 auto-rows-fr">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`${feature.span} group relative overflow-hidden bg-white rounded-3xl p-8 hover:shadow-2xl transition-all duration-300 border border-gray-100 hover:border-orange-200`}
            >
              {/* Background gradient on hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />

              {/* Content */}
              <div className="relative z-10">
                {/* Icon */}
                <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  <feature.icon className="w-7 h-7 text-white" />
                </div>

                {/* Title */}
                <h3 className="text-2xl font-bold text-gray-900 mb-3">
                  {feature.title}
                </h3>

                {/* Description */}
                <p className="text-gray-600 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
