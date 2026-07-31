import type { Metadata } from 'next';
import { publicSupabase, siteUrl } from '@/lib/publicSupabase';
import { examTypeName, formatPrice, LEVEL_BY_SLUG } from '@/lib/catalog';

/**
 * Per-paper search metadata.
 *
 * The page itself is interactive and therefore client-rendered, but a crawler
 * needs a real title, description and price before any JavaScript runs. This
 * layout supplies them server-side, so each paper competes for the query that
 * actually gets typed — "grade 9 integrated science end of term 2 exam pdf" —
 * rather than every paper sharing the site's single generic title.
 *
 * The JSON-LD block is what earns the price and availability badges in Google's
 * results, which is the difference between a listing and a listing people click.
 */

interface Props {
    params: Promise<{ id: string }>;
    children: React.ReactNode;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadPaper(id: string): Promise<any | null> {
    const supabase = publicSupabase();
    if (!supabase) return null;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const { data } = await supabase
        .from('exams')
        .select('id, slug, title, description, subject, grade_label, level_slug, exam_type, year, term_slug, total_marks, question_count, time_limit, price_cents, currency, has_marking_scheme, institution, created_at')
        .eq(isUuid ? 'id' : 'slug', id)
        .maybeSingle();

    return data;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id } = await params;
    const paper = await loadPaper(id);

    if (!paper) {
        return { title: 'Paper not found — Skulbase Exams' };
    }

    const level = paper.level_slug ? LEVEL_BY_SLUG[paper.level_slug] : undefined;
    const context = [paper.grade_label || level?.short, paper.subject, paper.year].filter(Boolean).join(' ');

    // Front-load the words people search with, and say the two things that
    // decide the click: whether answers are included, and what it costs.
    const title = `${paper.title} — PDF with ${paper.has_marking_scheme ? 'marking scheme' : 'questions'}`;

    const description =
        paper.description ||
        [
            `Download the ${context} ${examTypeName(paper.exam_type).toLowerCase()} as a print-ready PDF.`,
            paper.total_marks ? `${paper.total_marks} marks` : null,
            paper.question_count ? `${paper.question_count} questions` : null,
            paper.time_limit,
            paper.has_marking_scheme ? 'Marking scheme included.' : null,
            paper.price_cents === 0 ? 'Free download.' : `${formatPrice(paper.price_cents, paper.currency)}, pay by M-Pesa.`,
        ]
            .filter(Boolean)
            .join(' · ');

    const url = `${siteUrl()}/papers/${paper.slug || paper.id}`;

    return {
        title,
        description,
        alternates: { canonical: url },
        openGraph: {
            title,
            description,
            url,
            siteName: 'Skulbase Exams',
            type: 'website',
            locale: 'en_KE',
        },
        twitter: { card: 'summary_large_image', title, description },
        keywords: [
            paper.subject,
            paper.grade_label,
            examTypeName(paper.exam_type),
            paper.year ? String(paper.year) : '',
            'exam paper',
            'marking scheme',
            'PDF',
            'Kenya',
            level?.curriculum === 'CBE' ? 'CBE' : 'KCSE',
        ].filter(Boolean) as string[],
    };
}

export default async function PaperLayout({ params, children }: Props) {
    const { id } = await params;
    const paper = await loadPaper(id);

    // Product structured data. Google uses this to show the price and
    // availability directly in the result.
    const jsonLd = paper
        ? {
              '@context': 'https://schema.org',
              '@type': 'Product',
              name: paper.title,
              description: paper.description || `${paper.subject} exam paper with answers`,
              category: 'Educational Materials',
              brand: { '@type': 'Brand', name: 'Skulbase Exams' },
              offers: {
                  '@type': 'Offer',
                  price: (paper.price_cents / 100).toFixed(2),
                  priceCurrency: paper.currency || 'KES',
                  availability: 'https://schema.org/InStock',
                  url: `${siteUrl()}/papers/${paper.slug || paper.id}`,
              },
              ...(paper.institution ? { producer: { '@type': 'Organization', name: paper.institution } } : {}),
          }
        : null;

    return (
        <>
            {jsonLd && (
                <script
                    type="application/ld+json"
                    // Server-rendered constant built from our own database row.
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
            )}
            {children}
        </>
    );
}
