import { useState, useEffect } from 'react';

/**
 * Custom hook for responsive media queries.
 * Returns true when the media query matches.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Set initial value
    setMatches(mediaQuery.matches);

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** Returns true on mobile-sized screens (< 768px). */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}

/** Returns true on wide desktop screens (>= 1200px). */
export function useIsWideDesktop(): boolean {
  return useMediaQuery('(min-width: 1200px)');
}
