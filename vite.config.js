import { defineConfig } from 'vite';

// En GitHub Pages la web vive en /estadio/; en local, en /.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/estadio/' : '/',
  build: { target: 'es2022' },
});
