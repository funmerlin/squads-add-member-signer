import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    'process.env': {},
  },
  resolve: {
    alias: {
      buffer: 'buffer/',
    },
  },
  optimizeDeps: {
    include: ['buffer'],
  },
});
