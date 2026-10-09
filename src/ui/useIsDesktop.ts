import { useEffect, useState } from 'react';

const QUERY = '(min-width: 1024px)';

/** True on wide viewports, where the planning UI lives in a side column. */
export function useIsDesktop(): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const onChange = () => setMatches(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return matches;
}
