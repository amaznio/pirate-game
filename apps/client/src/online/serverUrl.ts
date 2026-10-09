/**
 * Where the game server is, or null when online play is not available.
 *
 *  - `VITE_SERVER_URL` is used when set (production).
 *  - During local development the server on this machine, port 3001.
 *  - A production build without `VITE_SERVER_URL` has no server: online play
 *    is switched off rather than pointed somewhere that cannot work.
 */
export function resolveServerUrl(
  env: { VITE_SERVER_URL?: string; DEV?: boolean } = import.meta.env,
  location: { protocol: string; hostname: string } = window.location,
): string | null {
  const configured = env.VITE_SERVER_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  if (env.DEV) {
    return `${location.protocol}//${location.hostname}:3001`;
  }
  return null;
}
