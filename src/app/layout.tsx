import type { Metadata } from 'next';
import Script from 'next/script';
import { Inter_Tight, JetBrains_Mono, Lora } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/lib/roles';

/*
 * THE FACES.
 *
 * One family carries the interface. Syne is gone: a display face earns its
 * keep by saying something the body face cannot, and next to dense metadata
 * on a phone it mostly said "heading". Hierarchy here comes from size, colour
 * and spacing instead — which is what the ten rules in the oa-design skill
 * mean by a weight ceiling.
 *
 * That ceiling is structural rather than a convention nobody remembers: only
 * 300, 400 and 500 are loaded, and `font-synthesis-weight: none` in
 * globals.css stops the browser faking the rest. The ~279 `font-bold` and
 * `font-semibold` classes already in the markup therefore resolve to 500
 * instead of needing a sweep through every file — and any new one does too.
 *
 * Two faces survive, both because they do a job Inter Tight cannot:
 *   JetBrains Mono — figures that must line up in a column: prices, marks,
 *                    totals, references, and literal code.
 *   Lora           — the printed exam papers, which should look like a real
 *                    script rather than like the app. Print only.
 *
 * Served by `next/font`, so the woff2 files are self-hosted from our own
 * origin and hashed into the build. The old <link> to fonts.googleapis.com
 * was a render-blocking round trip to a third party before any text could
 * paint — on the Kenyan mobile connection this product is designed for, that
 * is the most expensive kind of dependency. Only the interface face preloads;
 * the other two are asked for by the pages that actually use them.
 */
const sans = Inter_Tight({
    subsets: ['latin'],
    weight: ['300', '400', '500'],
    variable: '--font-sans-face',
    display: 'swap',
});

const mono = JetBrains_Mono({
    subsets: ['latin'],
    weight: ['400', '500'],
    variable: '--font-mono-face',
    display: 'swap',
    preload: false,
});

const serif = Lora({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
    style: ['normal', 'italic'],
    variable: '--font-serif-face',
    display: 'swap',
    preload: false,
});

export const metadata: Metadata = {
    title: 'Skulbase Exams — CBE exam papers & marking schemes',
    description:
        'Buy CBE exam papers with marking schemes for Pre-Primary to Grade 12 and Form 1-4, or set your own paper from the question bank. Part of Skulbase.',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html
            lang="en"
            className={`${sans.variable} ${mono.variable} ${serif.variable}`}
            suppressHydrationWarning
        >
            <body className="bg-background text-foreground min-h-screen">
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                >
                    {/*
                     * Above everything, because the navigation asks who is
                     * signed in on every page. One lookup and one auth
                     * subscription for the tab, rather than one per component
                     * that wants to know.
                     */}
                    <AuthProvider>{children}</AuthProvider>
                </ThemeProvider>
                <Toaster />
                <Script
                    src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"
                    strategy="beforeInteractive"
                />
            </body>
        </html>
    );
}
