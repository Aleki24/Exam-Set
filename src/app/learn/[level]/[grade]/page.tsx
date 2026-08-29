import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, ChevronRight } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import Footer from '@/components/shell/Footer';
import { createClient } from '@/utils/supabase/server';
import { LEVELS, LEVEL_BY_SLUG, gradeFromSlug, gradeSlug, type LevelSlug } from '@/lib/catalog';
import { subjectQueryNames, subjectsForLevel } from '@/lib/resources';

interface Params {
    params: Promise<{ level: string; grade: string }>;
}

/** Every grade of every level is known ahead of time. */
export function generateStaticParams() {
    return LEVELS.flatMap((level) =>
        level.grades.map((grade) => ({ level: level.slug, grade: gradeSlug(grade) }))
    );
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
    const { level: levelSlug, grade: gradeParam } = await params;
    const level = LEVEL_BY_SLUG[levelSlug];
    const grade = level ? gradeFromSlug(level, gradeParam) : undefined;
    if (!level || !grade) return { title: 'Not found' };

    return {
        title: `${grade} — learning areas | Skulbase Exams`,
        description: `Papers, marking schemes, notes, schemes of work and lesson plans for every ${grade} learning area.`,
    };
}

/**
 * ONE CLASS — the learning areas taught in it.
 *
 * The step this hierarchy was missing. It used to go level → subject, so
 * "Mathematics" meant Grade 7, 8 and 9 in one list: three years of curriculum a
 * teacher had to read past to reach their own. A Kenyan teacher does not teach
 * Junior School, they teach Grade 8 — the class is how they think about what
 * they need, so it is now a step of its own, the way every resource site a
 * teacher already uses arranges it.
 *
 * Subjects come from the curriculum, not from stock. A subject with nothing
 * behind it still belongs here, because its absence is information: a list
 * assembled from inventory hides half the curriculum and gives no way to tell
 * that it has. The count beside each one is what separates the two — it says
 * which shelves have something on them without pretending the others are not
 * part of the syllabus.
 */
export default async function GradePage({ params }: Params) {
    const { level: levelSlug, grade: gradeParam } = await params;
    const level = LEVEL_BY_SLUG[levelSlug];
    if (!level) notFound();

    const grade = gradeFromSlug(level, gradeParam);
    if (!grade) notFound();

    const subjects = subjectsForLevel(level.slug as LevelSlug);
    const counts = await countBySubject(level.slug as LevelSlug, grade);

    const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
    const stocked = subjects.filter((s) => subjectCount(counts, s) > 0).length;

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <main className="shell-width py-10 sm:py-14">
                <Breadcrumb level={level} grade={grade} />

                <header className="page-header mt-6">
                    <p className="overline">
                        {level.name} · {level.curriculum}
                    </p>
                    <h1 className="display-2 mt-3">{grade}</h1>
                    <p className="lead mt-4">
                        {total > 0
                            ? `${total} resource${total === 1 ? '' : 's'} across ${stocked} learning area${stocked === 1 ? '' : 's'}.`
                            : `Every ${grade} learning area is listed here. Nothing is stocked yet.`}
                    </p>
                </header>

                <section aria-labelledby="areas-heading" className="mt-12">
                    <div className="rule-heading">
                        <h2 id="areas-heading" className="overline">
                            Learning areas
                        </h2>
                        <span className="figure shrink-0 text-[11px] text-muted-foreground">
                            {subjects.length} in {grade}
                        </span>
                    </div>

                    <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {subjects.map((subject, index) => {
                            const count = subjectCount(counts, subject);
                            return (
                                <li key={subject.slug}>
                                    <Link
                                        href={`/learn/${level.slug}/${gradeSlug(grade)}/${subject.slug}`}
                                        className="tile settle-in group flex h-full items-center justify-between gap-3 p-4"
                                        style={{ '--i': index % 12 } as React.CSSProperties}
                                    >
                                        <span className="min-w-0">
                                            <span className="heading-ui block truncate transition-colors group-hover:text-primary">
                                                {subject.name}
                                            </span>
                                            {/* The count is the whole reason this
                                                page is worth loading: it says
                                                which shelf has something on it
                                                before anyone clicks into it. */}
                                            <span className="meta mt-0.5 block">
                                                {count > 0
                                                    ? `${count} resource${count === 1 ? '' : 's'}`
                                                    : 'Nothing yet'}
                                            </span>
                                        </span>
                                        <ArrowRight
                                            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
                                            aria-hidden
                                        />
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </section>

                <nav aria-label="Other classes" className="mt-16 border-t border-border pt-8">
                    <h2 className="overline">Other classes in {level.name}</h2>
                    <ul className="mt-3 flex flex-wrap gap-2">
                        {level.grades
                            .filter((other) => other !== grade)
                            .map((other) => (
                                <li key={other}>
                                    <Link
                                        href={`/learn/${level.slug}/${gradeSlug(other)}`}
                                        className="chip"
                                    >
                                        {other}
                                    </Link>
                                </li>
                            ))}
                    </ul>
                </nav>
            </main>

            <Footer />
        </div>
    );
}

/**
 * How much is stocked for each subject in this class.
 *
 * One query for the whole page rather than one per subject: at sixteen learning
 * areas that is sixteen round trips for a page that is mostly links, and the
 * rows are small — just the subject column of what is published.
 *
 * The subject is free text on older rows, so counting happens here against the
 * same alias list `subjectQueryNames` gives the detail page. Counting in SQL
 * would need that aliasing expressed in the query, and the two would drift.
 */
async function countBySubject(level: LevelSlug, grade: string): Promise<Map<string, number>> {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('exams')
            .select('subject')
            .eq('source', 'catalog')
            .eq('is_published', true)
            .eq('level_slug', level)
            .ilike('grade_label', grade)
            .limit(2000);

        if (error) {
            console.error('Grade shelf count failed:', error.message);
            return new Map();
        }

        const counts = new Map<string, number>();
        for (const row of data ?? []) {
            const key = String(row.subject ?? '').trim().toLowerCase();
            if (!key) continue;
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return counts;
    } catch (err) {
        // A shelf that cannot be counted is still a shelf worth showing.
        console.error('Grade shelf count unavailable:', err instanceof Error ? err.message : err);
        return new Map();
    }
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function subjectCount(counts: Map<string, number>, subject: any): number {
    return subjectQueryNames(subject).reduce(
        (sum: number, name: string) => sum + (counts.get(name.trim().toLowerCase()) ?? 0),
        0
    );
}

function Breadcrumb({ level, grade }: { level: { slug: string; name: string }; grade: string }) {
    return (
        <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <li>
                    <Link href="/learn" className="transition-colors hover:text-foreground">
                        Library
                    </Link>
                </li>
                <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
                <li>
                    <Link href={`/learn/${level.slug}`} className="transition-colors hover:text-foreground">
                        {level.name}
                    </Link>
                </li>
                <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
                <li aria-current="page" className="font-semibold text-foreground">
                    {grade}
                </li>
            </ol>
        </nav>
    );
}
