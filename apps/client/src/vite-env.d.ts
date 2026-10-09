/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Public URL of the game server (e.g. https://pirate-server.up.railway.app).
   * Baked in at build time. Unset in development: the server on this machine
   * at port 3001 is used.
   */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
