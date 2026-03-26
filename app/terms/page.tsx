import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service — HMU Cash Ride Corp.',
  description: 'Platform Agreement, Terms of Service, and Electronic Communications Consent for HMU Cash Ride.',
  alternates: {
    canonical: 'https://atl.hmucashride.com/terms',
  },
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-200">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        {/* Header */}
        <div className="mb-12">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-[#00E676] transition-colors mb-6 inline-block"
          >
            &larr; Back to home
          </Link>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 font-[family-name:var(--font-display)]">
            Terms of Service
          </h1>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500">
            <span>Effective Date: March 26, 2026</span>
            <span>Last Updated: March 26, 2026</span>
          </div>
          <p className="mt-4 text-sm text-gray-400">
            HMU Cash Ride Corp. &middot; Metro Atlanta, Georgia &middot;{' '}
            <a href="mailto:legal@hmucashride.com" className="text-[#00E676] hover:underline">
              legal@hmucashride.com
            </a>
          </p>
        </div>

        {/* Content */}
        <article className="prose prose-invert prose-gray max-w-none prose-headings:font-bold prose-headings:text-white prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-3 prose-p:text-gray-300 prose-p:leading-relaxed prose-li:text-gray-300 prose-a:text-[#00E676] prose-a:no-underline hover:prose-a:underline prose-strong:text-white">

          <h2>1. Platform Agreement Overview</h2>
          <p>
            HMU Cash Ride Corp. (&ldquo;HMU,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) operates a peer-to-peer ride platform connecting independent drivers (&ldquo;Drivers&rdquo;) and passengers (&ldquo;Riders&rdquo;) in Metro Atlanta, Georgia. Our platform is accessible at <strong>hmucashride.com</strong> and <strong>atl.hmucashride.com</strong> (the &ldquo;Platform&rdquo;).
          </p>
          <p>
            By creating an account, completing the onboarding process, or using the Platform in any capacity, you (&ldquo;you&rdquo; or &ldquo;User&rdquo;) agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;), our <Link href="/privacy">Privacy Policy</Link>, and all applicable laws and regulations. If you do not agree to these Terms, do not use the Platform.
          </p>

          <h2>2. Eligibility</h2>
          <p>To use the Platform, you must:</p>
          <ul>
            <li>Be at least 18 years of age</li>
            <li>Have a valid phone number capable of receiving SMS messages</li>
            <li>Provide accurate, truthful information during account creation and onboarding</li>
            <li>Agree to these Terms and our Privacy Policy</li>
          </ul>
          <p><strong>Drivers</strong> must additionally:</p>
          <ul>
            <li>Hold a valid driver&apos;s license issued by a U.S. state</li>
            <li>Have access to a registered, insured vehicle</li>
            <li>Provide vehicle information including license plate number and state</li>
            <li>Complete video identity verification during onboarding</li>
            <li>Maintain a valid payment account for receiving payouts</li>
          </ul>

          <h2>3. How the Platform Works</h2>
          <h3>3.1 For Drivers</h3>
          <p>
            Drivers set their own pricing and availability. When a Rider books a ride, the Rider&apos;s payment is held in escrow by our payment processor (Stripe) before the Driver departs. Upon successful ride completion and after the dispute window closes, funds are released to the Driver minus the applicable platform fee.
          </p>
          <h3>3.2 For Riders</h3>
          <p>
            Riders browse available Drivers, select a Driver, and confirm a ride. Payment is authorized and held in escrow at the time of booking. The Rider&apos;s payment method is charged only after the ride is completed and the dispute window has closed. Riders may file a dispute within 45 minutes of ride completion.
          </p>
          <h3>3.3 Escrow and Payment</h3>
          <p>
            All payments are processed through Stripe. HMU does not hold funds directly. Payment is authorized when the Rider confirms a ride (&ldquo;COO&rdquo;) and captured after the ride ends and the dispute window passes. Drivers receive payouts via Stripe Connect to their linked bank account or debit card.
          </p>

          <h2>4. Platform Fees</h2>
          <p>
            HMU charges Drivers a platform fee on each completed ride. The fee structure is progressive based on cumulative daily earnings and is subject to daily and weekly caps. The specific fee rates and caps are displayed to Drivers in the Platform and may be updated from time to time. Riders are not charged platform fees beyond the agreed ride price.
          </p>
          <p>
            HMU First subscribers pay a flat 12% platform fee with lower daily and weekly caps, plus additional benefits including instant payouts after every ride.
          </p>

          <h2>5. User Conduct</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Provide false, misleading, or inaccurate information in your profile or during rides</li>
            <li>Use the Platform for any unlawful purpose</li>
            <li>Harass, threaten, or intimidate other Users</li>
            <li>Attempt to circumvent the Platform&apos;s payment system</li>
            <li>Create multiple accounts for fraudulent purposes</li>
            <li>Interfere with or disrupt the Platform&apos;s operation</li>
            <li>Use the Platform while under the influence of alcohol or drugs (Drivers)</li>
            <li>Engage in discriminatory behavior toward other Users</li>
          </ul>

          <h2>6. Ratings and Community Standards</h2>
          <p>
            After each ride, both Drivers and Riders may rate each other using HMU&apos;s rating system. Ratings contribute to a User&apos;s Chill Score, which is publicly visible on their profile. Users who receive multiple safety-related ratings (&ldquo;WEIRDO&rdquo;) will be flagged for administrative review and may have their account suspended or terminated.
          </p>

          <h2>7. Disputes and Refunds</h2>
          <p>
            After a Driver ends a ride, a 45-minute dispute window opens. Riders may file a dispute during this window if they believe the ride was not completed as agreed. If no dispute is filed within 45 minutes, payment is automatically released to the Driver. Disputed rides are reviewed by HMU administrators, who will make a final determination on fund distribution.
          </p>

          <h2>8. Account Suspension and Termination</h2>
          <p>
            HMU reserves the right to suspend or terminate any User account at any time for violations of these Terms, fraudulent activity, safety concerns, or any other reason at our sole discretion. Users may also delete their account at any time by contacting <a href="mailto:legal@hmucashride.com">legal@hmucashride.com</a>.
          </p>

          <h2>9. GPS Location Tracking</h2>
          <p>
            During active rides, the Platform collects and transmits real-time GPS location data from the Driver&apos;s device. This data is used to provide ride tracking, proximity verification at pickup and dropoff, and dispute resolution. Location data is stored for 72 hours after ride completion and may be retained longer if a dispute is filed.
          </p>

          <h2>10. Video and Media</h2>
          <p>
            Users may upload video introductions and photos to their profiles. By uploading media to the Platform, you grant HMU a non-exclusive, royalty-free, worldwide license to display, distribute, and use that media in connection with the Platform, including but not limited to displaying your video on your public profile link and in Driver/Rider feeds.
          </p>

          <h2>11. Consent to Electronic Communications</h2>
          <p>
            <strong>By creating an account on HMU Cash Ride, you expressly consent to receive electronic communications from us, including but not limited to:</strong>
          </p>
          <h3>11.1 Transactional Messages (SMS and Email)</h3>
          <p>These are messages necessary for Platform operation. You will receive:</p>
          <ul>
            <li><strong>Account verification codes</strong> sent via SMS to your registered phone number during signup and login (powered by Twilio Verify)</li>
            <li><strong>Ride status notifications</strong> including booking confirmations, Driver OTW/HERE alerts, ride completion, and payment receipts</li>
            <li><strong>Payment notifications</strong> including escrow holds, payout confirmations, and dispute status updates</li>
            <li><strong>Account security alerts</strong> including password resets, suspicious activity warnings, and account status changes</li>
            <li><strong>Dispute notifications</strong> including dispute filed alerts, resolution updates, and time-sensitive countdown reminders</li>
          </ul>
          <p>
            Transactional messages are essential to the operation of the Platform and cannot be opted out of while you maintain an active account. Message frequency varies based on your usage of the Platform. Message and data rates may apply.
          </p>

          <h3>11.2 Marketing and Promotional Messages (SMS and Email)</h3>
          <p>With your consent, you may also receive:</p>
          <ul>
            <li><strong>Promotional offers</strong> including HMU First subscription promotions, driver signup incentives, and referral bonuses</li>
            <li><strong>Platform updates</strong> including new feature announcements, service area expansions, and community events</li>
            <li><strong>Re-engagement messages</strong> if you have not used the Platform recently</li>
            <li><strong>Driver earning opportunities</strong> including high-demand alerts and surge area notifications (Drivers only)</li>
          </ul>

          <h3>11.3 How to Opt Out</h3>
          <p>
            <strong>You may opt out of marketing and promotional messages at any time using any of the following methods:</strong>
          </p>
          <ul>
            <li><strong>SMS:</strong> Reply <strong>STOP</strong> to any marketing text message. You will receive a confirmation message and will no longer receive marketing SMS from HMU. This does not affect transactional messages.</li>
            <li><strong>Email:</strong> Click the <strong>&ldquo;Unsubscribe&rdquo;</strong> link at the bottom of any marketing email. Your request will be processed within 10 business days.</li>
            <li><strong>In-App:</strong> Navigate to <strong>Settings &gt; Notifications</strong> in the HMU app and toggle off marketing notifications.</li>
            <li><strong>Contact Us:</strong> Email <a href="mailto:optout@hmucashride.com">optout@hmucashride.com</a> with &ldquo;UNSUBSCRIBE&rdquo; in the subject line. Include your registered phone number and/or email address.</li>
          </ul>
          <p>
            <strong>Important:</strong> Opting out of marketing messages does not opt you out of transactional messages related to your rides, payments, account security, or disputes. To stop receiving all messages, you must deactivate your account.
          </p>
          <p>
            For SMS help, text <strong>HELP</strong> to any HMU message. For additional assistance, contact <a href="mailto:support@hmucashride.com">support@hmucashride.com</a>.
          </p>

          <h2>12. SMS Message Details</h2>
          <p>
            SMS messages are sent from HMU Cash Ride Corp. via our messaging provider Twilio. By providing your phone number and creating an account, you consent to receive autodialed or prerecorded SMS messages at the number provided. Consent is not a condition of purchase, but is required to use the Platform as phone verification is part of our identity and safety process.
          </p>
          <ul>
            <li><strong>Message frequency:</strong> Varies. Transactional messages are sent per ride event. Marketing messages are limited to no more than 4 per month.</li>
            <li><strong>Message and data rates may apply.</strong> Contact your wireless carrier for details about your texting plan.</li>
            <li><strong>Carriers supported:</strong> Major U.S. carriers including AT&amp;T, T-Mobile, Verizon, and others. HMU is not responsible for delayed or undelivered messages caused by carrier issues.</li>
            <li><strong>Privacy:</strong> Your phone number and messaging data are handled in accordance with our <Link href="/privacy">Privacy Policy</Link>. We do not sell your phone number to third parties.</li>
          </ul>

          <h2>13. Intellectual Property</h2>
          <p>
            The HMU name, logo, U-turn icon, and all Platform content, design, and code are the property of HMU Cash Ride Corp. and are protected by intellectual property laws. You may not copy, modify, distribute, or create derivative works from any Platform materials without our written consent.
          </p>

          <h2>14. Limitation of Liability</h2>
          <p>
            HMU is a technology platform that connects Drivers and Riders. <strong>HMU is not a transportation company and does not provide rides.</strong> Drivers are independent contractors, not employees of HMU. HMU is not responsible for the actions, conduct, or safety of any Driver or Rider.
          </p>
          <p>
            To the maximum extent permitted by law, HMU shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Platform, including but not limited to personal injury, property damage, lost profits, or data loss.
          </p>

          <h2>15. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless HMU Cash Ride Corp., its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including reasonable attorney&apos;s fees) arising from your use of the Platform, violation of these Terms, or violation of any law or rights of a third party.
          </p>

          <h2>16. Governing Law</h2>
          <p>
            These Terms are governed by the laws of the State of Georgia, without regard to conflict of law principles. Any disputes arising from these Terms or your use of the Platform shall be resolved in the courts of Fulton County, Georgia.
          </p>

          <h2>17. Changes to Terms</h2>
          <p>
            HMU reserves the right to update these Terms at any time. We will notify Users of material changes via email, SMS, or in-app notification at least 14 days before the changes take effect. Continued use of the Platform after changes take effect constitutes acceptance of the updated Terms.
          </p>

          <h2>18. Contact</h2>
          <p>
            For questions about these Terms, contact us at:
          </p>
          <ul>
            <li><strong>Email:</strong> <a href="mailto:legal@hmucashride.com">legal@hmucashride.com</a></li>
            <li><strong>Support:</strong> <a href="mailto:support@hmucashride.com">support@hmucashride.com</a></li>
            <li><strong>Opt-out requests:</strong> <a href="mailto:optout@hmucashride.com">optout@hmucashride.com</a></li>
          </ul>

        </article>
      </div>
    </main>
  );
}
