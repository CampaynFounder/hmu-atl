'use client';

import { createContext, useContext } from 'react';
import type { ContentMap, FlagMap } from './types';

interface CmsContextValue {
  content: ContentMap;
  flags: FlagMap;
  sectionOrder: string[];
  funnelStage: string;
}

const CmsContext = createContext<CmsContextValue>({ content: {}, flags: {}, sectionOrder: [], funnelStage: 'awareness' });

export function CmsProvider({
  initialContent,
  initialFlags,
  sectionOrder,
  funnelStage,
  children,
}: {
  initialContent: ContentMap;
  initialFlags?: FlagMap;
  sectionOrder?: string[];
  funnelStage?: string;
  children: React.ReactNode;
}) {
  return (
    <CmsContext.Provider value={{
      content: initialContent,
      flags: initialFlags ?? {},
      sectionOrder: sectionOrder ?? [],
      funnelStage: funnelStage ?? 'awareness',
    }}>
      {children}
    </CmsContext.Provider>
  );
}

export function useCmsContext() {
  return useContext(CmsContext);
}
