'use client';

// Testimonials Section - Social Proof Carousel
import { motion } from 'framer-motion';
import { Star, Quote } from 'lucide-react';

export function TestimonialsSection() {
  const testimonials = [
    {
      quote: "Way better than the Facebook groups. Found a ride in 2 minutes.",
      author: "Jasmine",
      location: "Midtown",
      rating: 5,
      rides: 12,
    },
    {
      quote: "I made $120 in 3 hours last Saturday. Way better than Lyft.",
      author: "Marcus",
      location: "College Park",
      rating: 5,
      rides: 47,
      badge: "OG Driver",
    },
    {
      quote: "Got to the airport for $20. Would've been $60 on Uber.",
      author: "Kayla",
      location: "Buckhead",
      rating: 5,
      rides: 8,
    },
  ];

  return (
    <section className="py-24 bg-gradient-to-br from-orange-50 to-amber-50">
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
            Loved by Atlanta
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Join the community that's making rides affordable again
          </p>
        </motion.div>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow relative"
            >
              {/* Quote Icon */}
              <div className="absolute -top-4 -left-4 w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-600 rounded-full flex items-center justify-center shadow-lg">
                <Quote className="w-6 h-6 text-white" />
              </div>

              {/* Rating */}
              <div className="flex gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                ))}
              </div>

              {/* Quote */}
              <p className="text-gray-700 text-lg mb-6 leading-relaxed">
                "{testimonial.quote}"
              </p>

              {/* Author */}
              <div className="flex items-center justify-between pt-6 border-t border-gray-100">
                <div>
                  <div className="font-semibold text-gray-900">{testimonial.author}</div>
                  <div className="text-sm text-gray-500">{testimonial.location}</div>
                </div>
                <div className="text-right">
                  {testimonial.badge && (
                    <div className="inline-block px-3 py-1 bg-gradient-to-r from-orange-500 to-amber-600 text-white text-xs font-bold rounded-full mb-1">
                      {testimonial.badge}
                    </div>
                  )}
                  <div className="text-sm text-gray-500">{testimonial.rides} rides</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
