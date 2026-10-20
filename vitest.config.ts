import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const mock = (name: string) => fileURLToPath(new URL(`./src/__mocks__/${name}.ts`, import.meta.url));

export default defineConfig({
    resolve: {
        alias: [
            // The real modules live in pkg/lib and need a running Cockpit
            // shell; unit tests use in-memory fakes instead.
            { find: /^cockpit$/, replacement: mock('cockpit') },
            { find: /^cockpit-dark-theme$/, replacement: mock('cockpit-dark-theme') },
        ],
    },
    test: {
        include: ['src/**/*.test.{ts,tsx}'],
        restoreMocks: true,
        server: {
            deps: {
                // PatternFly's ESM build imports .css files, which Node cannot
                // load; let Vite transform it (CSS is stubbed out in tests).
                inline: [/@patternfly\//],
            },
        },
        coverage: {
            provider: 'v8',
            include: ['src/**/*.{ts,tsx}'],
            exclude: ['src/**/*.test.{ts,tsx}', 'src/__mocks__/**'],
            reporter: ['text', 'json-summary', 'lcov'],
            thresholds: {
                statements: 90,
                branches: 90,
                functions: 90,
                lines: 90,
            },
        },
    },
});
