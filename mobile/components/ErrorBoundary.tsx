// Crash isolation. A render/commit error inside any wrapped subtree is caught
// here and replaced with `fallback` (default: nothing) INSTEAD of unmounting the
// whole React tree — which on a release build is a white-screen "app won't load"
// brick. We wrap each floating overlay and the routed <Slot/> in their OWN
// boundary so one bad component can never take down navigation or the others.

import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  // Optional label for logging which boundary tripped.
  label?: string;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Best-effort breadcrumb — never throws.
    try {
      console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}]`, error, info);
    } catch { /* noop */ }
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
