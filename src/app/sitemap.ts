import type { MetadataRoute } from 'next';
import { publicSupabase, siteUrl } from '@/lib/publicSupabase';
import { LEVELS } from '@/lib/catalog';

/**
 * The sitemap is how this shop gets found.
 *
 * Teachers do not browse to a paper shop — they search for "grade 9 integrated
 * science end of term 2 exam pdf". Every published paper needs its own URL in
 * here or Google has no route to it: the catalog is fetched client-side, so
 * there are no crawlable links to follow.
 *
 * Revalidated hourly so newly published papers appear without a redeploy.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const base = siteUrl();

    const staticRoutes: MetadataRoute.Sitemap = [
        { url: base, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
        { url: `${base}/catalog`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
        { url: `${base}/learn`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
        { url: `${base}/set`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
        { url: `${base}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
        { url: `${base}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
        // Worth indexing even though it is not in the navigation: "unlimited
        // KCSE past papers" is a query people type, and this is the page that
        // answers it.
        { url: `${base}/plans`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    ];

    // Level landing pages. These match how people actually search — by the class
    // they teach — and each one is a real filtered view of the catalog.
    const levelRoutes: MetadataRoute.Sitemap = LEVELS.map((level) => ({
        url: `${base}/catalog?level=${level.slug}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
    }));

    // This route is prerendered at build time, so anything thrown here fails the
    // whole deployment — a sitemap missing its paper URLs is bad for search, but
    // a site that will not deploy is worse. Every failure degrades to the static
    // routes instead.
    try {
        const supabase = publicSupabase();
        if (!supabase) return [...staticRoutes, ...levelRoutes];

        // Row level security limits this to published catalog papers, so a draft
        // can never end up in the sitemap.
        const { data, error } = await supabase
            .from('exams')
            .select('id, slug, updated_at, created_at')
            .eq('source', 'catalog')
            .eq('is_published', true)
            .order('created_at', { ascending: false })
            .limit(5000);

        if (error) {
            console.error('sitemap: could not list papers —', error.message);
            return [...staticRoutes, ...levelRoutes];
        }

        const paperRoutes: MetadataRoute.Sitemap = (data || []).map((paper) => ({
            url: `${base}/papers/${paper.slug || paper.id}`,
            lastModified: new Date(paper.updated_at || paper.created_at),
            changeFrequency: 'monthly' as const,
            priority: 0.9,
        }));

        return [...staticRoutes, ...levelRoutes, ...paperRoutes];
    } catch (err) {
        console.error('sitemap: falling back to static routes —', err instanceof Error ? err.message : err);
        return [...staticRoutes, ...levelRoutes];
    }
}
