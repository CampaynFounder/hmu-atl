'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface AblyMessage {
  name: string;
  data: unknown;
  timestamp: number;
}

interface UseAblyOptions {
  channelName: string | null;
  rideId?: string;
  blastId?: string;
  onMessage?: (msg: AblyMessage) => void;
}

export function useAbly({ channelName, rideId, blastId, onMessage }: UseAblyOptions) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<AblyMessage | null>(null);
  const ablyRef = useRef<any>(null);
  const channelRef = useRef<any>(null);
  // Use a ref for the callback so connection doesn't tear down when handler changes
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  // Stable refs for connection params
  const channelNameRef = useRef(channelName);
  channelNameRef.current = channelName;
  const rideIdRef = useRef(rideId);
  rideIdRef.current = rideId;
  const blastIdRef = useRef(blastId);
  blastIdRef.current = blastId;

  useEffect(() => {
    if (!channelName) return;

    let cancelled = false;

    async function connect() {
      try {
        const Ably = await import('ably');

        if (cancelled) return;

        const client = new Ably.Realtime({
          authCallback: async (_tokenParams: any, callback: any) => {
            try {
              const res = await fetch('/api/ably/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

        client.connection.on('connected', () => {
          if (!cancelled) setConnected(true);
        });
        client.connection.on('disconnected', () => {
          if (!cancelled) setConnected(false);
        });
        client.connection.on('suspended', () => {
          if (!cancelled) setConnected(false);
        });

        const channel = client.channels.get(channelNameRef.current!, {
          params: { rewind: '2m' }, // Catch messages from last 2 min on reconnect
        });
        channelRef.current = channel;

        channel.subscribe((msg: any) => {
          if (cancelled) return;
          const parsed: AblyMessage = {
            name: msg.name,
            data: msg.data,
            timestamp: msg.timestamp,
          };
          setLastMessage(parsed);
          onMessageRef.current?.(parsed);
        });
      } catch (err) {
        console.error('Ably connection error:', err);
      }
    }

    connect();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        try { channelRef.current.unsubscribe(); } catch {}
        channelRef.current = null;
      }
      if (ablyRef.current) {
        try { ablyRef.current.close(); } catch {}
        ablyRef.current = null;
      }
      setConnected(false);
    };
  }, [channelName]); // Only reconnect when the channel name changes

  const publish = useCallback(async (event: string, data: unknown) => {
    if (channelRef.current) {
      try {
        channelRef.current.publish(event, data);
      } catch (err) {
        console.error('Ably publish error:', err);
      }
    }
  }, []);

  return { connected, lastMessage, publish };
}
