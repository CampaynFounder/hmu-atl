// Shared ride chat state — used by both rider and driver active screens.
// Owns history fetch, optimistic send, and ingesting Ably `chat_message` events.
// The screens already subscribe to ride:{rideId} via useAbly; they call ingest()
// from their existing onMessage handler so there's no second subscription.

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';

export interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
  type?: string;
  quickKey?: string | null;
}

const ME = '__me__'; // optimistic sender marker (anything !== otherPartyId renders as mine)

export function useRideMessages(
  rideId: string | undefined,
  getToken: () => Promise<string | null>,
  otherPartyId: string | null,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const openRef = useRef(false);

  const fetchHistory = useCallback(async () => {
    if (!rideId) return;
    try {
      const t = await getToken();
      const d = await apiClient<{ messages: ChatMessage[] }>(`/rides/${rideId}/messages`, t);
      setMessages(d.messages ?? []);
    } catch { /* best-effort */ }
  }, [rideId, getToken]);

  useEffect(() => { void fetchHistory(); }, [fetchHistory]);

  // Called from the parent's Ably onMessage for `chat_message`.
  const ingest = useCallback((m: ChatMessage) => {
    if (!m?.id) return;
    setMessages((prev) => {
      if (prev.some((x) => x.id === m.id)) return prev;
      const opt = prev.find((x) => x.id.startsWith('opt_') && x.content === m.content && x.senderId === ME);
      if (opt) return prev.map((x) => (x.id === opt.id ? m : x));
      return [...prev, m];
    });
    if (otherPartyId && m.senderId === otherPartyId && !openRef.current) {
      setUnread((u) => u + 1);
    }
  }, [otherPartyId]);

  const send = useCallback(async (content: string, quickKey?: string) => {
    const text = content.trim();
    if (!rideId || !text || sending) return;
    setSending(true);
    const optId = `opt_${Date.now()}`;
    setMessages((prev) => [...prev, { id: optId, senderId: ME, content: text, createdAt: new Date().toISOString(), quickKey }]);
    try {
      const t = await getToken();
      const saved = await apiClient<ChatMessage>(`/rides/${rideId}/messages`, t, {
        method: 'POST',
        body: JSON.stringify({ content: text, quickKey }),
      });
      setMessages((prev) => prev.map((x) => (x.id === optId ? saved : x)));
    } catch {
      setMessages((prev) => prev.filter((x) => x.id !== optId)); // drop failed optimistic
    } finally {
      setSending(false);
    }
  }, [rideId, getToken, sending]);

  const setOpen = useCallback((open: boolean) => {
    openRef.current = open;
    if (open) setUnread(0);
  }, []);

  // A message is "mine" when it's NOT from the other party (covers optimistic +
  // my real id, without the client needing to know its own DB user id).
  const isMine = useCallback((m: ChatMessage) => !otherPartyId || m.senderId !== otherPartyId, [otherPartyId]);

  return { messages, unread, sending, send, ingest, setOpen, isMine };
}
