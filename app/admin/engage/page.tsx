// /admin/engage — outreach console. Access is enforced server-side by
// app/admin/layout.tsx against the `act.engage` rule in route-permissions.ts.
import { EngageConsole } from './engage-console';

export default function EngagePage() {
  return <EngageConsole />;
}
