import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme-provider';

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
        <html lang="en" suppressHydrationWarning>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                {/*
                 * The same three faces Skulbase uses, so the two products read as
                 * one family:
                 *   Syne           — display headings. Geometric and confident.
                 *   Inter          — UI and body copy.
                 *   JetBrains Mono — overlines, prices, references, tabular figures.
                 * Plus one of our own:
                 *   Lora           — the printed exam papers, which should look like
                 *                    a real script rather than like the app.
                 */}
                <link
                    href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Inter:wght@300..800&family=JetBrains+Mono:wght@400;500;600;700&family=Lora:ital,wght@0,400..700;1,400..700&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body className="bg-background text-foreground min-h-screen">
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                >
                    {children}
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
