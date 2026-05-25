import { Suspense } from 'react';
import CommentsModeration from './comments-moderation';

export const metadata = { title: 'Comments — HMU Admin' };

export default function CommentsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#888' }}>Loading…</div>}>
      <CommentsModeration />
    </Suspense>
  );
}
