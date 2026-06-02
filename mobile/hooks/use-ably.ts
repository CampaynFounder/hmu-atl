import { useEffect, useRef, useState, useCallback } from 'react';
import { API_BASE } from '@/lib/api';

export interface AblyMessage {
  name: string;
  data: unknown;
  timestamp: number;
}

interface UseAblyOptions {
  channelName: string | null;
  token: string | null; // Clerk JWT — required for auth
  rideId?: string;
  blastId?: string;
  onMessage?: (msg: AblyMessage) => void;
}

export function useAbly({ channelName, token, rideId, blastId, onMessage }: UseAblyOptions) {
  const [connected, setConnected] = useState(false);
  const ablyRef = useRef<any>(null);
  const channelRef = useRef<any>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const tokenRef = useRef(token);
  tokenRef.current = token;
  const rideIdRef = useRef(rideId);
  rideIdRef.current = rideId;
  const blastIdRef = useRef(blastId);
  blastIdRef.current = blastId;

  // Connect once a token is available, and reconnect only when the *channel*
  // changes — NOT on every token refresh. The screens mint a fresh Clerk JWT
  // every ~55s; keying the effect on the token string would destroy and rebuild
  // the Ably client each time, opening a reconnect gap that can drop live
  // status/location/add-on events. Ably's own authCallback (which reads
  // tokenRef.current) handles token renewal without recreating the client.
  const hasToken = token != null;
  useEffect(() => {
    if (!channelName || !tokenRef.current) return;

    let cancelled = false;

    async function connect() {
      try {
        const Ably = await import('ably');
        if (cancelled) return;

        const client = new Ably.Realtime({
          authCallback: async (_tokenParams: any, callback: any) => {
            try {
              const res = await fetch(`${API_BASE}/ably/token`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${tokenRef.current}`,
                },
                body: JSON.stringify({ rideId: rideIdRef.current, blastId: blastIdRef.current }),
              });
              const tokenDetails = await res.json();
              callback(null, tokenDetails);
            } catch (err) {
              callback(err, null);
            }
          },
          disconnectedRetryTimeout: 5000,
          suspendedRetryTimeout: 15000,
        });

        if (cancelled) { client.close(); return; }

        ablyRef.current = client;
        client.connection.on('connected', () => { if (!cancelled) setConnected(true); });
        client.connection.on('disconnected', () => { if (!cancelled) setConnected(false); });
        client.connection.on('suspended', () => { if (!cancelled) setConnected(false); });

        const channel = client.channels.get(channelName!, { params: { rewind: '2m' } });
        channelRef.current = channel;

        channel.subscribe((msg: any) => {
          if (cancelled) return;
          onMessageRef.current?.({ name: msg.name, data: msg.data, timestamp: msg.timestamp });
        });
      } catch (err) {
        console.error('[useAbly] connection error:', err);
      }
    }

    connect();

    return () => {
      cancelled = true;
      try { channelRef.current?.unsubscribe(); } catch {}
      channelRef.current = null;
      try { ablyRef.current?.close(); } catch {}
      ablyRef.current = null;
      setConnected(false);
    };
  }, [channelName, hasToken]);

  const publish = useCallback(async (event: string, data: unknown) => {
    try { channelRef.current?.publish(event, data); } catch {}
  }, []);

  return { connected, publish };
}
