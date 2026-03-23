import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — HMU Cash Ride Corp.',
  description: 'How HMU Cash Ride collects, uses, and protects your personal information.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-200">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        {/* Header */}
        <div className="mb-12">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-orange-400 transition-colors mb-6 inline-block"
          >
            ← Back to home
          </Link>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 font-[family-name:var(--font-display)]">
            Privacy Policy
          </h1>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500">
            <span>Effective Date: March 23, 2026</span>
            <span>Last Updated: March 23, 2026</span>
          </div>
          <p className="mt-4 text-sm text-gray-400">
            HMU Cash Ride Corp. &middot; Metro Atlanta, Georgia &middot;{' '}
            <a href="mailto:privacy@hmucashride.com" className="text-orange-400 hover:underline">
              privacy@hmucashride.com
            </a>
          </p>
        </div>

        {/* Content */}
        <article className="prose prose-invert prose-gray max-w-none prose-headings:font-bold prose-headings:text-white prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-3 prose-p:text-gray-300 prose-p:leading-relaxed prose-li:text-gray-300 prose-a:text-orange-400 prose-a:no-underline hover:prose-a:underline prose-strong:text-white">

          <h2>1. Introduction</h2>
          <p>
            HMU ATL (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is a mobile-first peer-to-peer ride platform connecting drivers and riders in Metro Atlanta. This Privacy Policy explains how we collect, use, share, and protect your personal information when you use our platform, website, and related services (collectively, the &ldquo;Services&rdquo;).
          </p>
          <p>
            By creating an account, using our Services, or submitting information to us, you agree to the terms of this Privacy Policy. If you do not agree, please do not use our Services.
          </p>
          <p>
            We are committed to transparency. If you have questions about how we handle your data, contact us at{' '}
            <a href="mailto:privacy@hmucashride.com">privacy@hmucashride.com</a>.
          </p>

          <h2>2. Who We Are</h2>
          <p>
            HMU ATL operates as a marketplace platform. We are not a transportation company. We provide technology that connects independent drivers with riders who wish to arrange local transportation in Metro Atlanta, Georgia.
          </p>
          <p>
            We act as the data controller for information collected through our platform. Drivers and riders are independent users of our platform, not employees of HMU ATL.
          </p>

          <h2>3. Information We Collect</h2>

          <h3>3.1 Information You Provide Directly</h3>
          <p><strong>Account Registration</strong></p>
          <ul>
            <li>Full name</li>
            <li>Email address</li>
            <li>Phone number (verified via SMS)</li>
            <li>Profile photograph</li>
            <li>Video introduction (required for account activation)</li>
            <li>Profile type (rider or driver)</li>
            <li>Gender identity (drivers only, optional, for rider preference matching)</li>
          </ul>

          <p><strong>Driver-Specific Information</strong></p>
          <ul>
            <li>Vehicle make, model, year, and color</li>
            <li>Vehicle photograph</li>
            <li>License plate number</li>
            <li>Service areas and availability schedule</li>
            <li>Pricing preferences</li>
            <li>Government-issued ID (collected by Stripe for identity verification)</li>
            <li>Social Security Number last four digits (collected by Stripe for payout compliance)</li>
            <li>Bank account or debit card information (collected and stored by Stripe)</li>
          </ul>

          <p><strong>Rider-Specific Information</strong></p>
          <ul>
            <li>Payment card or payment method details (collected and stored by Stripe)</li>
            <li>Pickup and drop-off addresses</li>
            <li>Ride preferences and price offers</li>
          </ul>

          <h3>3.2 Information We Collect Automatically</h3>
          <ul>
            <li>Device information (device type, operating system, browser type)</li>
            <li>IP address and approximate location</li>
            <li>GPS location data during active rides (driver location broadcast to matched rider)</li>
            <li>App usage data and session information</li>
            <li>Ride history, timestamps, and status events</li>
            <li>Communication metadata (message timestamps, not message content)</li>
            <li>Payment transaction records (amounts, timestamps, status)</li>
          </ul>

          <h3>3.3 Information from Third Parties</h3>
          <ul>
            <li><strong>Stripe:</strong> Payment processing, identity verification, and payout information</li>
            <li><strong>Clerk:</strong> Authentication and session management</li>
            <li><strong>Twilio:</strong> Phone number verification and SMS delivery confirmation</li>
            <li><strong>Dots:</strong> Payout disbursement to Cash App, Venmo, Zelle, PayPal, and bank accounts</li>
            <li><strong>Ably:</strong> Real-time ride status and location data infrastructure</li>
            <li><strong>Meta (Facebook/Instagram):</strong> If you connect via social login or interact with our ads</li>
            <li><strong>Mapbox:</strong> Mapping and geolocation services</li>
          </ul>

          <h2>4. How We Use Your Information</h2>

          <h3>4.1 To Provide Our Services</h3>
          <ul>
            <li>Create and manage your account</li>
            <li>Match riders with available drivers</li>
            <li>Process ride payments and hold funds in escrow</li>
            <li>Disburse earnings to drivers via their chosen payout method</li>
            <li>Track ride status and GPS location during active rides</li>
            <li>Send ride notifications, status updates, and alerts</li>
            <li>Resolve disputes between drivers and riders</li>
            <li>Enforce our 45-minute dispute window and escrow release process</li>
          </ul>

          <h3>4.2 For Safety and Trust</h3>
          <ul>
            <li>Verify driver and rider identities before account activation</li>
            <li>Review video introductions for account approval</li>
            <li>Monitor for fraud, disputes, and policy violations</li>
            <li>Maintain public dispute history and ratings for platform transparency</li>
            <li>Detect and prevent no-show abuse, fake accounts, and payment fraud</li>
            <li>Provide evidence in the event of a chargeback or payment dispute</li>
          </ul>

          <h3>4.3 For Platform Improvement</h3>
          <ul>
            <li>Analyze usage patterns to improve matching and pricing</li>
            <li>Conduct sentiment analysis on user comments (via OpenAI) before posting</li>
            <li>Calculate and display Chill Scores and platform ratings</li>
            <li>Track driver earnings tiers and cap calculations</li>
          </ul>

          <h3>4.4 For Marketing and Communications</h3>
          <ul>
            <li>Send transactional emails and SMS messages related to your rides</li>
            <li>Send promotional communications about HMU ATL (you may opt out at any time)</li>
            <li>Use hashed contact information to create custom audiences on Meta platforms for advertising</li>
            <li>Measure the effectiveness of our marketing campaigns</li>
          </ul>

          <h3>4.5 Legal and Compliance</h3>
          <ul>
            <li>Comply with applicable laws and regulations</li>
            <li>Generate 1099 tax forms for drivers earning above IRS thresholds</li>
            <li>Respond to lawful requests from law enforcement or regulatory authorities</li>
            <li>Enforce our Terms of Service and other platform policies</li>
          </ul>

          <h2>5. How We Share Your Information</h2>

          <h3>5.1 With Other Platform Users</h3>
          <p>When a ride is matched, we share limited profile information between the driver and rider to facilitate the ride:</p>
          <ul>
            <li>Driver&apos;s first name, profile photo, vehicle information, Chill Score, and ride count are visible to matched riders</li>
            <li>Rider&apos;s first name, profile photo, Chill Score, and OG Status are visible to matched drivers</li>
            <li>GPS location is shared in real-time during active rides only</li>
            <li>Comments are visible based on tier: HMU First drivers can read rider comments; OG riders can read driver comments</li>
          </ul>

          <h3>5.2 With Service Providers</h3>
          <p>We share information with third-party service providers who help us operate our platform:</p>
          <ul>
            <li><strong>Stripe:</strong> Payment processing, escrow management, identity verification, and driver payouts</li>
            <li><strong>Dots:</strong> Multi-rail payout disbursement (Cash App, Venmo, Zelle, PayPal, bank transfers)</li>
            <li><strong>Clerk:</strong> User authentication and session management</li>
            <li><strong>Twilio:</strong> SMS verification and ride notifications</li>
            <li><strong>Ably:</strong> Real-time ride tracking infrastructure</li>
            <li><strong>Mapbox:</strong> Mapping and geolocation services</li>
            <li><strong>OpenAI:</strong> Comment sentiment analysis (text only, no personal identifiers sent)</li>
            <li><strong>Cloudflare:</strong> Hosting, security, and content delivery</li>
            <li><strong>PostHog:</strong> Product analytics (anonymized usage data)</li>
            <li><strong>Sentry:</strong> Error tracking and performance monitoring</li>
          </ul>

          <h3>5.3 With Meta Platforms</h3>
          <p>We use Meta&apos;s advertising tools to reach potential users. This includes:</p>
          <ul>
            <li>Uploading hashed phone numbers to create Custom Audiences for advertising</li>
            <li>Using the Meta Pixel and Conversions API to measure ad performance</li>
            <li>Building Lookalike Audiences based on our existing user base</li>
          </ul>
          <p>
            All data shared with Meta for advertising purposes is hashed before transmission. Meta cannot use this data to identify individuals outside of their advertising platform.
          </p>

          <h3>5.4 For Legal Reasons</h3>
          <ul>
            <li>To comply with a legal obligation, court order, or government request</li>
            <li>To protect the rights, property, or safety of HMU ATL, our users, or the public</li>
            <li>To investigate potential fraud, safety issues, or policy violations</li>
            <li>In connection with a merger, acquisition, or sale of our business assets</li>
          </ul>

          <h3>5.5 Public Information</h3>
          <p>The following information is publicly visible to all platform users regardless of tier:</p>
          <ul>
            <li>Driver and rider display names</li>
            <li>Profile photographs</li>
            <li>Chill Scores and rating breakdowns</li>
            <li>Completed ride counts</li>
            <li>Dispute counts and history</li>
            <li>HMU First and OG Status badges</li>
          </ul>

          <h2>6. Location Data</h2>
          <p>Location data is central to how HMU ATL works. Here is exactly how we use it:</p>
          <ul>
            <li>Driver GPS location is broadcast to matched riders in real time during active rides only</li>
            <li>Location is published every 10 seconds or when the driver moves more than 50 meters</li>
            <li>Location tracking stops immediately when the ride ends</li>
            <li>We store GPS trail data for 30 days then permanently delete it</li>
            <li>Location data from completed rides may be retained as evidence in open disputes</li>
            <li>Approximate location (city level) may be used for analytics and marketing</li>
          </ul>
          <p>
            You can disable location access in your device settings but this will prevent the platform from functioning correctly.
          </p>

          <h2>7. Payment and Financial Information</h2>
          <p>
            HMU ATL does not store your payment card numbers, bank account numbers, or full SSN. All sensitive financial information is collected and stored directly by our payment partners:
          </p>
          <ul>
            <li><strong>Stripe</strong> handles all payment card data, bank account verification, and driver identity verification under PCI DSS compliance</li>
            <li><strong>Dots</strong> handles payout disbursement to Cash App, Venmo, Zelle, PayPal, and bank accounts</li>
          </ul>
          <p>
            We retain transaction records including amounts, timestamps, ride identifiers, and payout status. These records are used for accounting, dispute resolution, and tax reporting.
          </p>
          <p>
            Drivers who earn above IRS reporting thresholds will receive a 1099-K or 1099-NEC form. We collect and verify tax information (W-9 or W-8BEN) through our payout partners as required by law.
          </p>

          <h2>8. Data Retention</h2>
          <p>We retain your information for as long as necessary to provide our Services and comply with legal obligations:</p>
          <ul>
            <li><strong>Active account data:</strong> retained while your account is active</li>
            <li><strong>GPS ride trail data:</strong> deleted after 30 days</li>
            <li><strong>Ride history and transaction records:</strong> retained for 7 years for tax and legal compliance</li>
            <li><strong>Dispute records and evidence:</strong> retained for 3 years after resolution</li>
            <li><strong>Video introductions:</strong> retained while your account is active; deleted within 30 days of account closure</li>
            <li><strong>Marketing data and analytics:</strong> retained for 2 years</li>
            <li><strong>Deleted account data:</strong> anonymized within 90 days of deletion request, except where retention is legally required</li>
          </ul>

          <h2>9. Your Privacy Rights</h2>

          <h3>9.1 All Users</h3>
          <ul>
            <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
            <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
            <li><strong>Deletion:</strong> Request deletion of your account and associated data (subject to legal retention requirements)</li>
            <li><strong>Portability:</strong> Request your data in a machine-readable format</li>
            <li><strong>Opt-out of marketing:</strong> Unsubscribe from promotional emails or SMS at any time</li>
          </ul>

          <h3>9.2 California Residents (CCPA)</h3>
          <p>California residents have additional rights under the California Consumer Privacy Act:</p>
          <ul>
            <li>Right to know what personal information we collect, use, share, or sell</li>
            <li>Right to delete personal information we have collected</li>
            <li>Right to opt out of the sale of personal information</li>
            <li>Right to non-discrimination for exercising your privacy rights</li>
          </ul>
          <p>
            HMU ATL does not sell personal information to third parties. We share information with service providers as described in Section 5 of this policy.
          </p>

          <h3>9.3 How to Exercise Your Rights</h3>
          <p>To exercise any of your rights, contact us at:</p>
          <ul>
            <li><strong>Email:</strong> <a href="mailto:privacy@hmucashride.com">privacy@hmucashride.com</a></li>
            <li><strong>Subject line:</strong> Privacy Rights Request</li>
            <li><strong>Include:</strong> your name, email address on file, and the specific request</li>
          </ul>
          <p>
            We will respond within 30 days. We may need to verify your identity before processing your request.
          </p>

          <h2>10. Cookies and Tracking Technologies</h2>
          <p>We use the following tracking technologies on our website and platform:</p>
          <ul>
            <li><strong>Essential cookies:</strong> Required for the platform to function (authentication, session management)</li>
            <li><strong>Analytics cookies:</strong> PostHog anonymized usage tracking to improve our product</li>
            <li><strong>Meta Pixel:</strong> Tracks visits and conversions on our marketing pages for ad optimization</li>
            <li><strong>Conversions API:</strong> Server-side event tracking sent directly to Meta to supplement pixel data</li>
          </ul>
          <p>
            You can control cookies through your browser settings. Disabling certain cookies may affect platform functionality.
          </p>

          <h2>11. Children&apos;s Privacy</h2>
          <p>
            HMU ATL is not directed at individuals under the age of 18. We do not knowingly collect personal information from anyone under 18. If we become aware that we have collected data from a minor, we will delete it immediately. If you believe a minor has provided us with personal information, contact us at{' '}
            <a href="mailto:privacy@hmucashride.com">privacy@hmucashride.com</a>.
          </p>

          <h2>12. Security</h2>
          <p>We implement industry-standard security measures to protect your information:</p>
          <ul>
            <li>TLS encryption for all data in transit</li>
            <li>Encrypted storage for sensitive data at rest</li>
            <li>Phone number verification required at signup</li>
            <li>Manual admin review of video introductions before account activation</li>
            <li>Rate limiting and fraud detection on all API endpoints</li>
            <li>SOC 2 compliant infrastructure through our service providers</li>
          </ul>
          <p>
            No security system is perfect. In the event of a data breach that affects your rights, we will notify you as required by applicable law.
          </p>

          <h2>13. Third-Party Links and Services</h2>
          <p>
            Our platform may contain links to third-party websites or integrate with third-party services. This Privacy Policy does not apply to those third parties. We encourage you to review the privacy policies of any third-party services you use in connection with our platform.
          </p>

          <h2>14. Changes to This Privacy Policy</h2>
          <p>We may update this Privacy Policy from time to time. When we make material changes, we will:</p>
          <ul>
            <li>Update the Effective Date at the top of this document</li>
            <li>Send a notification to your registered email address</li>
            <li>Display a notice in the app when you next log in</li>
          </ul>
          <p>
            Your continued use of the Services after the effective date of the revised policy constitutes your acceptance of the changes.
          </p>

          <h2>15. Contact Us</h2>
          <p>If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, contact us:</p>
          <p>
            <strong>HMU Cash Ride Corp.</strong><br />
            Email: <a href="mailto:privacy@hmucashride.com">privacy@hmucashride.com</a><br />
            Web: <a href="https://hmucashride.com/privacy">hmucashride.com/privacy</a><br />
            Metro Atlanta, Georgia, United States
          </p>
          <p>We aim to respond to all privacy inquiries within 5 business days.</p>

          <hr className="border-gray-800 my-12" />
          <p className="text-xs text-gray-600">
            This Privacy Policy was prepared for HMU Cash Ride Corp. and is intended to satisfy the requirements of Meta&apos;s advertising platform, Stripe&apos;s Connect program, and applicable US privacy laws including CCPA. This document does not constitute legal advice.
          </p>
        </article>
      </div>
    </main>
  );
}
