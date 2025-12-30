import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    reactStrictMode: true,
    experimental: {
        serverComponentsExternalPackages: ['puppeteer', '@sparticuz/chromium'],
    },
};

export default nextConfig;
