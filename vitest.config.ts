import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.open-next/**',
      '**/out/**',
      '**/dist/**',
      'videos/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/payments/**/*.ts', 'lib/stripe/**/*.ts', 'app/api/webhooks/**/*.ts'],
      exclude: ['**/__tests__/**', '**/*.test.ts'],
    },
  },
});
