// Separate process: never load Vite's default .env files or reuse a server.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
const root = process.argv[2];
const server = await createServer({
  configFile: false, envFile: false, root, cacheDir: process.env.JEV_CACHE,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.join(root, 'src'), '@contracts': path.join(root, 'supabase/functions/_shared/contracts') } },
  server: { host: '127.0.0.1', port: Number(process.env.JEV_PORT), strictPort: true, fs: { deny: ['.env', '.env.*', '**/.git/**'] } },
});
await server.listen();
process.send?.({ ready: true });
for (const sig of ['SIGTERM','SIGINT']) process.on(sig, async () => { await server.close(); process.exit(); });
