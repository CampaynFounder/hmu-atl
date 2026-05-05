'use client';

// Renders the action-panel UserProfile (suspend/ban/grant OG/SMS/etc).
// The field-based dashboards system that briefly lived here is parked under
// app/admin/dashboards and lib/admin/dashboards — bring it back by reading
// docs/ADMIN-DASHBOARDS-SPEC.md and re-mounting it on this route.

import { useParams, useRouter } from 'next/navigation';
import { UserProfile } from '../user-profile';

export default function UserDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  return <UserProfile userId={id} onBack={() => router.push('/admin/users')} />;
}
