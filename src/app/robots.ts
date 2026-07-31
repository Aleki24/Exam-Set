import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/publicSupabase';

/**
 * Crawlers are welcome on the shop and the setter, and nowhere else.
 *
 * The disallowed paths are either private (a buyer's library, the admin
 * console), useless in an index (the cart), or gated behind a purchase (the
 * download endpoints, which return signed URLs).
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: ['/admin', '/library', '/cart', '/auth/', '/api/', '/papers/new'],
            },
        ],
        sitemap: `${siteUrl()}/sitemap.xml`,
        host: siteUrl(),
    };
}
