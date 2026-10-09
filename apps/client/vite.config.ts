import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { checkServerUrl } from './src/online/serverUrlCheck.ts';

export default defineConfig(({ mode }) => {
  // VITE_SERVER_URL is baked into the bundle, so a wrong value is caught here,
  // at build time, instead of shipping a client that cannot reach its server.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const check = checkServerUrl(env.VITE_SERVER_URL, mode === 'production');
  if (check.level === 'error') {
    throw new Error(check.message ?? 'Invalid VITE_SERVER_URL');
  }
  if (check.level === 'warn') {
    console.warn(`\n[pirate] WARNING: ${check.message}\n`);
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      port: 5173,
    },
  };
});
