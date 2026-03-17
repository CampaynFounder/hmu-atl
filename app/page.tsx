'use client';

// Premium Time-Based Adaptive Theme
// Sophisticated dark theme (6pm-6am) + elegant light theme (6am-6pm)
// Deep purple, electric blue, cyan accents - no pink

import { motion, useScroll } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { useState, useEffect } from 'react';
import { Zap, Shield, Users, TrendingUp } from 'lucide-react';

export default function HomePage() {
  const [isDark, setIsDark] = useState(true);
  const { scrollYProgress } = useScroll();

  // Time-based theme switching (6am-6pm = light, 6pm-6am = dark)
  useEffect(() => {
    const checkTime = () => {
      const hour = new Date().getHours();
      setIsDark(hour < 6 || hour >= 18); // Dark from 6pm to 6am
    };

    checkTime();
    const interval = setInterval(checkTime, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={isDark ? 'dark-theme' : 'light-theme'}>
      {/* Scroll Progress Bar */}
      <motion.div
        className={`fixed top-0 left-0 right-0 h-0.5 z-[60] ${
          isDark
            ? 'bg-gradient-to-r from-purple-500 via-blue-500 to-cyan-400'
            : 'bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-500'
        }`}
        style={{ scaleX: scrollYProgress, transformOrigin: '0%' }}
      />

      {/* Hero Section */}
      <section className={`relative min-h-screen flex items-center justify-center overflow-hidden pt-16 ${
        isDark ? 'bg-[#0A0A0A]' : 'bg-gradient-to-br from-gray-50 via-white to-blue-50'
      }`}>
        {/* Fine Grid Background (smaller 2rem grid) */}
        {isDark && (
          <div className="absolute inset-0 opacity-15">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#7C3AED_0.5px,transparent_0.5px),linear-gradient(to_bottom,#7C3AED_0.5px,transparent_0.5px)] bg-[size:2rem_2rem] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)]" />
          </div>
        )}

        {/* Sophisticated Gradient Orbs */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: isDark ? [0.2, 0.4, 0.2] : [0.15, 0.3, 0.15],
          }}
          transition={{ duration: 8, repeat: Infinity }}
          className={`absolute top-1/4 right-1/4 w-[500px] h-[500px] rounded-full blur-[120px] ${
            isDark
              ? 'bg-gradient-to-r from-purple-600 to-blue-600'
              : 'bg-gradient-to-r from-purple-300 to-blue-300'
          }`}
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: isDark ? [0.15, 0.35, 0.15] : [0.1, 0.25, 0.1],
          }}
          transition={{ duration: 10, repeat: Infinity }}
          className={`absolute bottom-1/4 left-1/4 w-[500px] h-[500px] rounded-full blur-[120px] ${
            isDark
              ? 'bg-gradient-to-r from-cyan-500 to-blue-500'
              : 'bg-gradient-to-r from-cyan-300 to-blue-400'
          }`}
        />

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-32 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            {/* Premium Badge */}
            <div className={`inline-flex items-center gap-2 px-6 py-3 rounded-full mb-8 backdrop-blur-xl shadow-lg border ${
              isDark
                ? 'bg-purple-500/10 border-purple-500/30'
                : 'bg-purple-100/80 border-purple-200'
            }`}>
              <span className="relative flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isDark ? 'bg-cyan-400' : 'bg-cyan-500'
                }`}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 ${
                  isDark ? 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]' : 'bg-cyan-500'
                }`}></span>
              </span>
              <span className={`text-sm font-bold ${
                isDark ? 'text-purple-300' : 'text-purple-700'
              }`}>
                Launching Q2 2026 • Metro Atlanta
              </span>
            </div>

            {/* Main Headline */}
            <h1 className={`text-6xl sm:text-7xl md:text-8xl font-bold mb-6 leading-tight ${
              isDark ? 'text-white' : 'text-gray-900'
            }`}>
              <span className="block">Metro Atlanta's</span>
              <span className={`block bg-clip-text text-transparent ${
                isDark
                  ? 'bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400'
                  : 'bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-600'
              }`}>
                Premium Rideshare
              </span>
              <span className="block">Network</span>
            </h1>

            <p className={`text-2xl mb-12 max-w-3xl mx-auto ${
              isDark ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Skip the surge. Build community. Ride premium.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`px-10 py-5 rounded-2xl font-bold text-lg transition-all ${
                  isDark
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-[0_0_40px_rgba(124,58,237,0.4)] hover:shadow-[0_0_60px_rgba(124,58,237,0.6)]'
                    : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-xl hover:shadow-2xl'
                }`}
              >
                Join Waitlist
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`px-10 py-5 rounded-2xl font-bold text-lg transition-all border-2 ${
                  isDark
                    ? 'border-purple-500/50 text-white hover:bg-purple-500/10'
                    : 'border-purple-300 text-gray-900 hover:bg-purple-50'
                }`}
              >
                How It Works
              </motion.button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-8 max-w-3xl mx-auto mt-20">
              <AnimatedStat value={127} suffix="+" label="Drivers Ready" isDark={isDark} />
              <AnimatedStat value={8} prefix="$" label="Avg. Ride" isDark={isDark} />
              <AnimatedStat value={5} suffix="min" label="Avg. Wait" isDark={isDark} />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className={`py-32 px-4 ${
        isDark ? 'bg-[#0A0A0A]' : 'bg-white'
      }`}>
        <div className="max-w-6xl mx-auto">
          <SectionHeader
            title="Premium Features"
            subtitle="Built for modern Atlanta"
            isDark={isDark}
          />

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-16">
            <FeatureCard
              icon={<Zap className="w-8 h-8" />}
              title="Instant Matching"
              description="Connect in seconds"
              isDark={isDark}
              delay={0.1}
            />
            <FeatureCard
              icon={<Shield className="w-8 h-8" />}
              title="Payment Escrow"
              description="Safe & secure"
              isDark={isDark}
              delay={0.2}
            />
            <FeatureCard
              icon={<Users className="w-8 h-8" />}
              title="Community Trust"
              description="Verified neighbors"
              isDark={isDark}
              delay={0.3}
            />
            <FeatureCard
              icon={<TrendingUp className="w-8 h-8" />}
              title="Chill Score"
              description="Reputation system"
              isDark={isDark}
              delay={0.4}
            />
          </div>
        </div>
      </section>

      {/* Pricing Comparison */}
      <section className={`py-32 px-4 ${
        isDark ? 'bg-zinc-950/50' : 'bg-gray-50'
      }`}>
        <div className="max-w-6xl mx-auto">
          <SectionHeader
            title="Save Up to 60%"
            subtitle="Transparent pricing, no surge"
            isDark={isDark}
          />

          <div className="grid md:grid-cols-3 gap-8 mt-16">
            <PricingCard
              route="Buckhead → Airport"
              hmuPrice={18}
              uberPrice={45}
              isDark={isDark}
              delay={0.1}
            />
            <PricingCard
              route="Midtown → Downtown"
              hmuPrice={8}
              uberPrice={22}
              isDark={isDark}
              delay={0.2}
            />
            <PricingCard
              route="Decatur → Buckhead"
              hmuPrice={15}
              uberPrice={38}
              isDark={isDark}
              delay={0.3}
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className={`py-32 px-4 ${
        isDark ? 'bg-[#0A0A0A]' : 'bg-white'
      }`}>
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className={`rounded-3xl p-12 shadow-2xl relative overflow-hidden ${
              isDark
                ? 'bg-gradient-to-br from-purple-900/30 to-blue-900/30 border border-purple-500/20'
                : 'bg-gradient-to-br from-purple-100 to-blue-100'
            }`}
          >
            <div className="relative z-10">
              <h2 className={`text-4xl sm:text-5xl font-bold mb-6 ${
                isDark ? 'text-white' : 'text-gray-900'
              }`}>
                Ready to Save?
              </h2>
              <p className={`text-xl mb-8 ${
                isDark ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Join 500+ Atlantans on the waitlist
              </p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`px-10 py-5 rounded-2xl font-bold text-lg transition-all ${
                  isDark
                    ? 'bg-white text-purple-600 hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]'
                    : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-xl hover:shadow-2xl'
                }`}
              >
                Get Early Access
              </motion.button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

// Components

function AnimatedStat({ value, prefix = '', suffix = '', label, isDark }: any) {
  const [count, setCount] = useState(0);
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.3 });

  useEffect(() => {
    if (inView) {
      let start = 0;
      const end = value;
      const duration = 2000;
      const increment = end / (duration / 16);

      const timer = setInterval(() => {
        start += increment;
        if (start >= end) {
          setCount(end);
          clearInterval(timer);
        } else {
          setCount(Math.floor(start));
        }
      }, 16);

      return () => clearInterval(timer);
    }
  }, [inView, value]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6 }}
      className="text-center"
    >
      <div className={`text-5xl font-bold mb-2 ${
        isDark
          ? 'bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400'
          : 'bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-cyan-600'
      }`}>
        {prefix}{count}{suffix}
      </div>
      <div className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
        {label}
      </div>
    </motion.div>
  );
}

function SectionHeader({ title, subtitle, isDark }: any) {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.3 });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      className="text-center"
    >
      <h2 className={`text-4xl sm:text-5xl font-bold mb-4 ${
        isDark ? 'text-white' : 'text-gray-900'
      }`}>
        {title}
      </h2>
      <p className={`text-xl ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
        {subtitle}
      </p>
    </motion.div>
  );
}

function FeatureCard({ icon, title, description, isDark, delay }: any) {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.3 });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay, duration: 0.6 }}
      whileHover={{ y: -8, scale: 1.02 }}
      className={`rounded-3xl p-8 border transition-all duration-300 ${
        isDark
          ? 'bg-zinc-900 border-purple-500/20 hover:border-purple-500/50 shadow-xl hover:shadow-2xl hover:shadow-purple-500/20'
          : 'bg-white border-purple-200 hover:border-purple-300 shadow-lg hover:shadow-xl'
      }`}
    >
      <div className={`inline-flex p-4 rounded-2xl mb-6 ${
        isDark
          ? 'bg-gradient-to-br from-purple-500/10 to-blue-500/10 text-purple-400'
          : 'bg-gradient-to-br from-purple-100 to-blue-100 text-purple-600'
      }`}>
        {icon}
      </div>
      <h3 className={`text-xl font-bold mb-3 ${
        isDark ? 'text-white' : 'text-gray-900'
      }`}>
        {title}
      </h3>
      <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>
        {description}
      </p>
    </motion.div>
  );
}

function PricingCard({ route, hmuPrice, uberPrice, isDark, delay }: any) {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.3 });
  const savings = uberPrice - hmuPrice;
  const percent = Math.round((savings / uberPrice) * 100);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay, duration: 0.8 }}
      whileHover={{ y: -8, scale: 1.05 }}
      className={`rounded-3xl p-8 transition-all border ${
        isDark
          ? 'bg-zinc-900 border-purple-500/20 shadow-xl hover:shadow-2xl'
          : 'bg-white border-purple-200 shadow-lg hover:shadow-xl'
      }`}
    >
      <div className={`text-sm font-semibold mb-3 ${
        isDark ? 'text-gray-400' : 'text-gray-600'
      }`}>
        {route}
      </div>
      <div className="flex items-baseline gap-2 mb-4">
        <span className={`text-5xl font-bold bg-clip-text text-transparent ${
          isDark
            ? 'bg-gradient-to-r from-purple-400 to-cyan-400'
            : 'bg-gradient-to-r from-purple-600 to-cyan-600'
        }`}>
          ${hmuPrice}
        </span>
        <span className={`text-2xl line-through ${
          isDark ? 'text-gray-600' : 'text-gray-400'
        }`}>
          ${uberPrice}
        </span>
      </div>
      <div className={`inline-block px-4 py-2 rounded-full text-sm font-bold ${
        isDark
          ? 'bg-cyan-500/10 text-cyan-400'
          : 'bg-cyan-100 text-cyan-700'
      }`}>
        Save ${savings} ({percent}% off)
      </div>
    </motion.div>
  );
}
