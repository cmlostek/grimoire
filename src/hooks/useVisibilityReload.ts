import { useEffect, useRef } from 'react';

/**
 * Re-calls `load` whenever the page tab becomes visible again after being
 * hidden. This keeps realtime data fresh when players switch between tabs —
 * Supabase websockets can silently stall on some browsers when backgrounded.
 */
export function useVisibilityReload(load: () => void) {
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        loadRef.current();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);
}
