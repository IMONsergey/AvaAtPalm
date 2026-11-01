import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://ava-at-palm-imon.vercel.app',
  output: 'static',
  adapter: vercel(),
  trailingSlash: 'always',
  devToolbar: { enabled: false },
  server: { port: 4323 },
});
