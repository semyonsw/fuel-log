/**
 * `src/lib` is pure and needs nothing. The store reaches AsyncStorage, a native
 * module that cannot load under Node, so one alias swaps in an in-memory stub and
 * the persistence layer is tested for real. Components are verified by running
 * the app, so nothing here mocks `react-native`.
 */
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@react-native-async-storage/async-storage',
        replacement: resolve(__dirname, 'test/asyncStorageStub.ts'),
      },
    ],
  },
  test: { include: ['src/**/*.test.ts'] },
});
