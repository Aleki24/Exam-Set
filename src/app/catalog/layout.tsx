import type { Metadata } from 'next';

/**
 * The catalogue's own metadata.
 *
 * `/` used to carry this, back when `/` was the shop. The landing page now
 * describes the platform, so the words that describe the *stock* — and the
 * queries that should reach it — belong here instead.
 */
export const metadata: Metadata = {
    title: 'Catalogue — CBE exam papers, schemes of work & notes | Skulbase Exams',
    description:
        'Search every CBE and 8-4-4 resource: exam papers with marking schemes, schemes of work, lesson plans, records of work, revision notes and set-book guides for Pre-Primary to Grade 12 and Form 1-4.',
};

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
    return children;
}
