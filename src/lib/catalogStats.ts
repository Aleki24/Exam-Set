import { publicSupabase } from './publicSupabase';

/**
 * How much of each thing is actually stocked.
 *
 * The landing page and the category pages both want to say "N schemes of work"
 * — and the only honest way to say it is to count. This reads the published
 * catalogue through the anonymous client, so it sees exactly what a visitor
 * sees: row level security keeps drafts and private sets out of the number.
 *
 * Every caller must handle `null`. When Supabase is unreachable the answer is
 * "not known", and a card that is not told a count says nothing about quantity
 * rather than guessing at one — the difference between an unknown and a zero is
 * the whole reason this returns `null` instead of an empty object.
 */
export interface CatalogStats {
    /** `resource_kind` slug → how many are published. */
    kinds: Record<string, number>;
    /** Level slug → how many are published. */
    levels: Record<string, number>;
    /** Everything published, of every kind. */
    total: number;
}

export async function catalogStats(): Promise<CatalogStats | null> {
    const supabase = publicSupabase();
    if (!supabase) return null;

    try {
        const { data, error } = await supabase
            .from('exams')
            .select('resource_kind, level_slug')
            .eq('source', 'catalog')
            .eq('is_published', true)
            .limit(5000);

        if (error) {
            console.error('catalogStats: could not count the catalogue —', error.message);
            return null;
        }

        const stats: CatalogStats = { kinds: {}, levels: {}, total: (data || []).length };
        for (const row of data || []) {
            // A row with no kind predates the taxonomy, and the default is a
            // past paper — the same assumption the migration made.
            const kind = (row.resource_kind as string | null) || 'past-paper';
            stats.kinds[kind] = (stats.kinds[kind] ?? 0) + 1;

            const level = row.level_slug as string | null;
            if (level) stats.levels[level] = (stats.levels[level] ?? 0) + 1;
        }
        return stats;
    } catch (err) {
        console.error('catalogStats failed:', err instanceof Error ? err.message : err);
        return null;
    }
}
