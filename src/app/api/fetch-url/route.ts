import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

export async function POST(req: NextRequest) {
    try {
        const { url } = await req.json();

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();

        // Set a realistic viewport and user agent
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Extract clean text content
        const data = await page.evaluate(() => {
            // Remove common noise elements
            const selectorsToRemove = [
                'nav', 'header', 'footer', 'script', 'style', 'noscript',
                'iframe', '.sidebar', '.ads', '.navigation', '.menu', '.social-share'
            ];

            selectorsToRemove.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => el.remove());
            });

            // Target main content areas if they exist, otherwise use body
            const mainContentSelectors = ['main', 'article', '.content', '.post-content', '#content', '.entry-content', '.paper-content'];
            let contentElement = null;

            for (const selector of mainContentSelectors) {
                const el = document.querySelector(selector);
                if (el) {
                    contentElement = el;
                    break;
                }
            }

            if (!contentElement) contentElement = document.body;

            // Get text and clean it up (extra whitespace, etc)
            const text = (contentElement as HTMLElement).innerText || contentElement.textContent || '';
            return {
                title: document.title,
                text: text.replace(/\s+/g, ' ').trim()
            };
        });

        await browser.close();

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Scraping Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to fetch URL content' }, { status: 500 });
    }
}
