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
    /**
     * `/` was the shop until the library outgrew it, and the sitemap has been
     * handing Google `/?level=<slug>` for every level since. Those results are
     * already indexed, and without this they would land on the new marketing
     * page with the filter silently dropped — a visitor who clicked "Junior
     * School exam papers" would get a hero and no papers.
     *
     * Only the filtered form redirects. A bare `/` is the landing page now and
     * must stay one, so the `has` guard is what makes this safe — and doing it
     * here rather than in the page keeps `/` a static, hourly-revalidated
     * document instead of a dynamic render on every visit.
     */
    async redirects() {
        // One entry per key, because several `has` conditions on one rule are
        // ANDed — and these need to be ORed. Next forwards the query string to
        // the destination, so the filter survives the hop.
        return ['level', 'kind', 'subject', 'grade', 'exam_type', 'term', 'year', 'set', 'search'].map(
            (key) => ({
                source: '/',
                has: [{ type: 'query' as const, key }],
                destination: '/catalog',
                permanent: true,
            })
        );
    },
};

export default nextConfig;
