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
  onMessage?: (msg: AblyMessage) => void;
}

export function useAbly({ channelName, rideId, onMessage }: UseAblyOptions) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<AblyMessage | null>(null);
  const ablyRef = useRef<any>(null);
  const channelRef = useRef<any>(null);

  const connect = useCallback(async () => {
    if (!channelName) return;

    try {
      // Dynamically import Ably to avoid SSR issues
      const Ably = await import('ably');

      const client = new Ably.Realtime({
        authCallback: async (tokenParams: any, callback: any) => {
          try {
            const res = await fetch('/api/ably/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ rideId }),
            });
            const tokenDetails = await res.json();
            callback(null, tokenDetails);
          } catch (err) {
            callback(err, null);
          }
        },
      });

      ablyRef.current = client;

      client.connection.on('connected', () => setConnected(true));
      client.connection.on('disconnected', () => setConnected(false));

      const channel = client.channels.get(channelName);
      channelRef.current = channel;

      channel.subscribe((msg: any) => {
        const parsed: AblyMessage = {
          name: msg.name,
          data: msg.data,
          timestamp: msg.timestamp,
        };
        setLastMessage(parsed);
        onMessage?.(parsed);
      });
    } catch (err) {
      console.error('Ably connection error:', err);
    }
  }, [channelName, rideId, onMessage]);

  useEffect(() => {
    connect();

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
      if (ablyRef.current) {
        ablyRef.current.close();
      }
    };
  }, [connect]);

  const publish = useCallback(async (event: string, data: unknown) => {
    if (channelRef.current) {
      channelRef.current.publish(event, data);
    }
  }, []);

  return { connected, lastMessage, publish };
}
