import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    reactStrictMode: true,
    eslint: {
        ignoreDuringBuilds: true,
    },
    serverExternalPackages: ['puppeteer', '@sparticuz/chromium', 'pdf-parse', 'pdfjs-dist'],
    /**
     * pdfjs loads its worker with a specifier it builds at runtime, marked
     * `webpackIgnore` so that nothing tries to follow it. Nothing does: the
     * trace for the extract route listed `pdf.mjs` and none of the two
     * megabytes of `pdf.worker.mjs` beside it, so the worker never reached the
     * deployed function and every PDF upload failed on "Setting up fake worker
     * failed". Naming the file here puts it in the bundle regardless.
     *
     * `services/documentText` also imports it by its literal path, which is
     * the belt to this pair of braces — either alone is enough, and the cost
     * of both is one line and no ambiguity about whether the file ships.
     * `scripts/verify-deployment-tracing.mjs` checks the built manifest so
     * this cannot quietly stop being true.
     */
    outputFileTracingIncludes: {
        '/api/questions/extract': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
    },
    experimental: {
        serverActions: {
            bodySizeLimit: '50mb',
        },
    },
};

export default nextConfig;
