import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.(t|j)s'],
      exclude: [
        '**/*.spec.ts',
        'src/**/index.ts',
        '**/*.d.ts',
        '**/*.types.ts',
        '**/*.input.ts',
      ],
    },
  },
});
