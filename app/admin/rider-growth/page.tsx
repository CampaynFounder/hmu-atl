import { MessageHistory } from '../messages/message-history';

// Rider Growth — a second VoIP.ms number dedicated to rider acquisition.
// Reuses the Messages inbox (thread list + conversation + composer) but scoped
// to the 'rider_growth' SMS line, so every send/reply/mark-read uses the
// separate number and stays out of the main Messages inbox + badge.
//
// Access is gated by the `grow.ridergrowth` permission (see route-permissions);
// the admin layout enforces it, so superadmins grant it per-role in /admin/roles.
export default function RiderGrowthPage() {
  return (
    <MessageHistory
      line="rider_growth"
      title="Rider Growth"
      showStats={false}
      showPlaybook={false}
      emptyHint="Conversations on the Rider Growth number will appear here. Text riders from Outreach or User Management to start one."
    />
  );
}
