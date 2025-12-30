import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
    title: 'ExamGenius AI',
    description: 'AI-powered exam question generator and builder',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Roboto+Mono:wght@400;700&family=Lora:ital,wght@0,400..700;1,400..700&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body className="bg-background text-foreground overflow-hidden h-screen">
                {children}
                <Script
                    src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"
                    strategy="beforeInteractive"
                />
            </body>
        </html>
    );
}
