import { defineConfig } from 'tsup';

// One self-contained file for production. The shared game-core package is
// TypeScript source, so it is bundled in; socket.io stays a normal dependency
// installed by pnpm.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@pirate/game-core'],
});
