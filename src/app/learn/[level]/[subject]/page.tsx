import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, FileQuestion } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import Footer from '@/components/shell/Footer';
import { createClient } from '@/utils/supabase/server';
import { LEVEL_BY_SLUG, formatPrice, examTypeName, type LevelSlug } from '@/lib/catalog';
import {
    RESOURCE_FAMILIES,
    RESOURCE_KIND_BY_SLUG,
    kindsForLevel,
    subjectBySlug,
    subjectQueryNames,
    subjectsForLevel,
    type ResourceFamily,
} from '@/lib/resources';

interface Params {
    params: Promise<{ level: string; subject: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
    const { level: levelSlug, subject: subjectSlug } = await params;
    const level = LEVEL_BY_SLUG[levelSlug];
    const subject = level ? subjectBySlug(level.slug as LevelSlug, subjectSlug) : undefined;
    if (!level || !subject) return { title: 'Not found' };

    return {
        title: `${subject.name} — ${level.name} | Skulbase Exams`,
        description: `${subject.name} papers, marking schemes, notes, schemes of work and lesson plans for ${level.grades.join(', ')}.`,
    };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ONE SUBJECT — everything that exists, grouped by what it is.
 *
 * The end of the hierarchy, and the first page here that touches the database.
 * Resources are grouped by kind rather than listed flat because the two people
 * who arrive want different halves of it: a learner wants papers, a teacher
 * wants schemes of work, and a single list sorted by date interleaves them into
 * something neither can scan.
 *
 * Read with the anonymous server client. Row level security already restricts
 * this to published catalog stock, which is exactly what should be public — the
 * shop lists it before sign-in, so requiring a session here would hide the
 * catalogue from the people it is meant to attract.
 */
export default async function SubjectPage({ params }: Params) {
    const { level: levelSlug, subject: subjectSlug } = await params;
    const level = LEVEL_BY_SLUG[levelSlug];
    if (!level) notFound();

    const subject = subjectBySlug(level.slug as LevelSlug, subjectSlug);
    if (!subject) notFound();

    const resources = await loadResources(level.slug as LevelSlug, subjectQueryNames(subject));

    // Group by kind, then by family, dropping everything empty. What is left is
    // an honest picture of the shelf rather than a template with gaps in it.
    const byKind = new Map<string, any[]>();
    for (const row of resources) {
        const kind = row.resource_kind || 'past-paper';
        if (!byKind.has(kind)) byKind.set(kind, []);
        byKind.get(kind)!.push(row);
    }

    const available = kindsForLevel(level.slug as LevelSlug);
    const groups = RESOURCE_FAMILIES.map((family) => ({
        family,
        kinds: available
            .filter((k) => k.family === family && byKind.has(k.slug))
            .map((k) => ({ def: k, rows: byKind.get(k.slug)! })),
    })).filter((g) => g.kinds.length > 0);

    const siblings = subjectsForLevel(level.slug as LevelSlug).filter((s) => s.slug !== subject.slug);

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <main className="shell-width py-10 sm:py-14">
                <Breadcrumb level={level} subject={subject.name} />

                <header className="mt-6 max-w-2xl">
                    <p className="overline">
                        {level.name} · {level.short}
                    </p>
                    <h1 className="display-2 mt-3">{subject.name}</h1>
                    <p className="lead mt-4">
                        {resources.length > 0
                            ? `${resources.length} resource${resources.length === 1 ? '' : 's'} for ${level.grades.join(', ')}.`
                            : `Nothing stocked for ${level.name} yet — this is where it will appear.`}
                    </p>
                </header>

                {groups.length > 0 ? (
                    <div className="mt-12 space-y-14">
                        {groups.map((group) => (
                            <FamilySection key={group.family} family={group.family} kinds={group.kinds} />
                        ))}
                    </div>
                ) : (
                    <EmptyShelf level={level.name} subject={subject.name} />
                )}

                {siblings.length > 0 && (
                    <nav aria-label="Other learning areas" className="mt-16 border-t border-border pt-8">
                        <h2 className="overline">Other learning areas in {level.name}</h2>
                        <ul className="mt-3 flex flex-wrap gap-2">
                            {siblings.map((other) => (
                                <li key={other.slug}>
                                    <Link href={`/learn/${level.slug}/${other.slug}`} className="chip">
                                        {other.name}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>
                )}
            </main>
            <Footer />
        </div>
    );
}

/**
 * Published catalog stock for one subject at one level.
 *
 * Matched against every name the subject has been stored under: `exams.subject`
 * is free text on older rows, so "History" and "History and Government" are one
 * shelf to a teacher and two strings to Postgres. Matching only the current
 * name would show half the stock and look like the rest had been lost.
 */
async function loadResources(level: LevelSlug, names: string[]): Promise<any[]> {
    try {
        const supabase = await createClient();

        const quoted = names.map((n) => `"${n.replace(/"/g, '')}"`).join(',');

        const { data, error } = await supabase
            .from('exams')
            .select(
                'id, slug, title, subject, grade_label, exam_type, resource_kind, term_slug, year, ' +
                    'total_marks, question_count, price_cents, currency, has_marking_scheme, ' +
                    'institution, download_count, created_at'
            )
            .eq('source', 'catalog')
            .eq('is_published', true)
            .eq('level_slug', level)
            .or(`subject.in.(${quoted})`)
            .order('year', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) {
            console.error('Subject shelf query failed:', error.message);
            return [];
        }
        return data ?? [];
    } catch (err) {
        // A catalogue page that cannot reach the database should still render
        // its own structure. An empty shelf with working navigation beats a
        // crash on the one page a visitor came to browse.
        console.error('Subject shelf unavailable:', err instanceof Error ? err.message : err);
        return [];
    }
}

function FamilySection({
    family,
    kinds,
}: {
    family: ResourceFamily;
    kinds: { def: (typeof RESOURCE_KIND_BY_SLUG)[string]; rows: any[] }[];
}) {
    return (
        <section aria-labelledby={`family-${family.replace(/\W/g, '')}`}>
            <h2 id={`family-${family.replace(/\W/g, '')}`} className="overline">
                {family}
            </h2>

            <div className="mt-4 space-y-10">
                {kinds.map(({ def, rows }) => (
                    <div key={def.slug}>
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                            <h3 className="title-2">{def.plural}</h3>
                            <span className="figure text-[11px] text-muted-foreground">
                                {rows.length} available
                            </span>
                        </div>
                        <p className="meta mt-1">{def.description}</p>

                        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {rows.map((row, index) => (
                                <li key={row.id}>
                                    <ResourceCard row={row} index={index} />
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </section>
    );
}

/**
 * One resource.
 *
 * Deliberately the same shape as the shop's PaperCard — the title carries the
 * weight, one quiet line of metadata, one coloured element — but rendered on
 * the server and linking rather than buying. Adding to a cart needs a client
 * component and a session; this page needs neither, and staying static is what
 * makes it open instantly on a phone.
 */
function ResourceCard({ row, index }: { row: any; index: number }) {
    const free = row.price_cents === 0;
    const href = `/papers/${row.slug || row.id}`;

    const meta = [row.grade_label, row.year, row.institution].filter(Boolean).join(' · ');
    const facts = [
        row.total_marks > 0 ? `${row.total_marks} marks` : null,
        row.question_count > 0 ? `${row.question_count} questions` : null,
        row.has_marking_scheme ? '+ scheme' : null,
    ]
        .filter(Boolean)
        .join(' · ');

    return (
        <Link
            href={href}
            className="sheet settle-in group flex h-full flex-col p-4"
            style={{ '--i': index % 12 } as React.CSSProperties}
        >
            {row.exam_type && <p className="overline">{examTypeName(row.exam_type)}</p>}

            <h4 className="title-2 mt-3 transition-colors group-hover:text-primary">{row.title}</h4>

            {meta && <p className="meta mt-2">{meta}</p>}

            <div className="flex-1" />

            {facts && (
                <p className="figure mt-5 text-[11px] leading-relaxed text-muted-foreground">{facts}</p>
            )}

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
                <span className="figure text-sm font-semibold">
                    {free ? (
                        <span className="text-success">Free</span>
                    ) : (
                        formatPrice(row.price_cents, row.currency)
                    )}
                </span>
                {row.download_count > 0 && (
                    <span className="figure text-[11px] text-muted-foreground">
                        {row.download_count} downloads
                    </span>
                )}
            </div>
        </Link>
    );
}

/**
 * Nothing stocked yet.
 *
 * Says so plainly and then offers the two things that are never empty — the
 * question bank, and the rest of the level. An empty shelf that only apologises
 * is a dead end; the point is to leave with something.
 */
function EmptyShelf({ level, subject }: { level: string; subject: string }) {
    return (
        <div className="ruled mt-12 rounded-[var(--radius)] border border-border p-10 text-center">
            <FileQuestion className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <h2 className="title-1 mt-4">No {subject} resources yet</h2>
            <p className="lead mx-auto mt-3 max-w-md">
                Nothing has been stocked for {level} {subject} so far. You can still build a paper
                yourself from the question bank, which covers every strand.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/set" className="btn-primary">
                    Set your own paper
                </Link>
                <Link href="/catalog" className="btn-outline">
                    Search the catalogue
                </Link>
            </div>
        </div>
    );
}

function Breadcrumb({ level, subject }: { level: { slug: string; name: string }; subject: string }) {
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
                <li aria-current="page" className="text-foreground">
                    {subject}
                </li>
            </ol>
        </nav>
    );
}
