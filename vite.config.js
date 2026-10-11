import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // 127.0.0.1, not localhost: the game server listens on IPv4 only, and macOS
    // resolves localhost to ::1 first, which can stall the upgrade.
    proxy: { '/ws': { target: 'ws://127.0.0.1:3001', ws: true } }
  }
});
