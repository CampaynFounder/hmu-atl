'use client';

// Onboarding preview mode — read-only, no side effects.
//
// Live onboarding components (DriverOnboardingExpress, RiderOnboarding, etc.)
// use this context to short-circuit network mutations: profile saves, video
// uploads, photo uploads, OS permission prompts, analytics. The components
// stay a single source of truth — admin training surfaces just wrap them in
// `<OnboardingPreviewProvider>` and the side effects no-op.
//
// Default is *not* preview, so production paths render unchanged.

import { createContext, useContext, type ReactNode } from 'react';

interface PreviewModeValue {
  enabled: boolean;
  // Optional callback so the admin "/admin/flows" surface can show what
  // *would* have been POSTed when a step finishes saving.
  onIntercept?: (event: { kind: string; payload: unknown }) => void;
}

const Ctx = createContext<PreviewModeValue>({ enabled: false });

export function OnboardingPreviewProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: PreviewModeValue;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboardingPreviewMode(): PreviewModeValue {
  return useContext(Ctx);
}
