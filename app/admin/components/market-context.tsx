'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface Market {
  id: string;
  slug: string;
  name: string;
  status: string;
  driverCount: number;
  riderCount: number;
  completedRides: number;
  areaCount: number;
}

interface MarketContextValue {
  markets: Market[];
  selectedMarketId: string | null;
  selectedMarket: Market | null;
  setSelectedMarketId: (id: string | null) => void;
  loading: boolean;
}

const MarketContext = createContext<MarketContextValue>({
  markets: [],
  selectedMarketId: null,
  selectedMarket: null,
  setSelectedMarketId: () => {},
  loading: true,
});

export function useMarket() {
  return useContext(MarketContext);
}

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/markets')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.markets) {
          setMarkets(data.markets);
          // Default to first live market, or first market
          const saved = typeof window !== 'undefined' ? localStorage.getItem('hmu_admin_market') : null;
          if (saved && data.markets.find((m: Market) => m.id === saved)) {
            setSelectedMarketId(saved);
          } else {
            const live = data.markets.find((m: Market) => m.status === 'live');
            setSelectedMarketId(live?.id || data.markets[0]?.id || null);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSetMarket = useCallback((id: string | null) => {
    setSelectedMarketId(id);
    if (id && typeof window !== 'undefined') {
      localStorage.setItem('hmu_admin_market', id);
    }
  }, []);

  const selectedMarket = markets.find(m => m.id === selectedMarketId) || null;

  return (
    <MarketContext.Provider value={{ markets, selectedMarketId, selectedMarket, setSelectedMarketId: handleSetMarket, loading }}>
      {children}
    </MarketContext.Provider>
  );
}
