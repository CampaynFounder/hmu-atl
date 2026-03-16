'use client';

// Pricing Comparison - Show the value prop with numbers
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';

export function PricingComparison() {
  const routes = [
    { from: 'Buckhead', to: 'Airport', hmu: 18, competitor: 45 },
    { from: 'Midtown', to: 'Downtown', hmu: 8, competitor: 22 },
    { from: 'Decatur', to: 'Buckhead', hmu: 15, competitor: 38 },
  ];

  const savings = routes.map(route => ({
    ...route,
    saved: route.competitor - route.hmu,
    percent: Math.round(((route.competitor - route.hmu) / route.competitor) * 100),
  }));

  return (
    <section className="py-24 bg-white">
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
            Save Up to <span className="text-orange-600">60%</span> Per Ride
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Real routes, real savings. See how much you could save with HMU Cash Ride.
          </p>
        </motion.div>

        {/* Comparison Table */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="overflow-hidden rounded-3xl border border-gray-200 shadow-2xl"
        >
          <table className="w-full">
            <thead>
              <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
                <th className="py-6 px-6 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">
                  Route
                </th>
                <th className="py-6 px-6 text-center text-sm font-semibold text-orange-600 uppercase tracking-wider">
                  HMU Cash Ride
                </th>
                <th className="py-6 px-6 text-center text-sm font-semibold text-gray-600 uppercase tracking-wider">
                  Uber/Lyft
                </th>
                <th className="py-6 px-6 text-center text-sm font-semibold text-green-600 uppercase tracking-wider">
                  You Save
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {savings.map((route, index) => (
                <tr key={index} className="hover:bg-orange-50/50 transition-colors">
                  <td className="py-6 px-6 text-gray-900 font-medium">
                    {route.from} → {route.to}
                  </td>
                  <td className="py-6 px-6 text-center">
                    <div className="text-3xl font-bold text-orange-600">${route.hmu}</div>
                  </td>
                  <td className="py-6 px-6 text-center">
                    <div className="text-3xl font-bold text-gray-400 line-through">${route.competitor}</div>
                  </td>
                  <td className="py-6 px-6 text-center">
                    <div className="text-2xl font-bold text-green-600">${route.saved}</div>
                    <div className="text-sm text-green-600">({route.percent}% off)</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>

        {/* Driver vs Platform Fee */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-12 grid md:grid-cols-2 gap-8"
        >
          {/* HMU Cash Ride */}
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl p-8 border-2 border-orange-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center">
                <Check className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900">HMU Cash Ride</h3>
            </div>
            <div className="space-y-3 text-gray-700">
              <div className="flex justify-between items-center">
                <span>Platform Fee</span>
                <span className="font-bold text-orange-600">15%</span>
              </div>
              <div className="flex justify-between items-center text-lg">
                <span>Driver Keeps</span>
                <span className="font-bold text-green-600">85%</span>
              </div>
            </div>
          </div>

          {/* Competitors */}
          <div className="bg-gray-50 rounded-2xl p-8 border-2 border-gray-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gray-400 rounded-full flex items-center justify-center">
                <X className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900">Uber/Lyft</h3>
            </div>
            <div className="space-y-3 text-gray-700">
              <div className="flex justify-between items-center">
                <span>Platform Fee</span>
                <span className="font-bold text-red-600">30%+</span>
              </div>
              <div className="flex justify-between items-center text-lg">
                <span>Driver Keeps</span>
                <span className="font-bold text-gray-600">~70%</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
