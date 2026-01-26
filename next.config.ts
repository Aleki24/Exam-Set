import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    reactStrictMode: true,
    serverExternalPackages: ['puppeteer', '@sparticuz/chromium', 'pdf-parse', 'pdfjs-dist'],
    experimental: {
        serverActions: {
            bodySizeLimit: '50mb',
        },
    },
};

export default nextConfig;
