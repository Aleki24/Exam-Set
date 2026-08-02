import { createClient } from '@/utils/supabase/server';
import { requireAdmin } from '@/utils/auth/guards';
import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

/**
 * Returns why a URL may not be fetched, or null when it is acceptable.
 *
 * Deny by default: only http and https, never an address that resolves inside
 * the infrastructure. The literal forms below are the ones that actually get
 * used — link-local metadata at 169.254.169.254, loopback, and the three
 * private ranges.
 */
function rejectionReason(raw: string): string | null {
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return 'That is not a valid URL.';
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return 'Only http and https addresses can be fetched.';
    }

    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    if (
        host === 'localhost' ||
        host.endsWith('.localhost') ||
        host.endsWith('.internal') ||
        host.endsWith('.local') ||
        host === '::1' ||
        host === '0.0.0.0'
    ) {
        return 'That address is not reachable from here.';
    }

    // IPv4 literals in a private, loopback or link-local range.
    const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (v4) {
        const [a, b] = [Number(v4[1]), Number(v4[2])];
        const isPrivate =
            a === 10 ||
            a === 127 ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 100 && b >= 64 && b <= 127);
        if (isPrivate) return 'That address is not reachable from here.';
    }

    // IPv6 unique-local and link-local.
    if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
        return 'That address is not reachable from here.';
    }

    return null;
}

export async function POST(req: NextRequest) {
    {
        // Guarded: this route had no authentication at all.
        const supabase = await createClient();
        const { failure } = await requireAdmin(supabase);
        if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });
    }

    try {
        const { url } = await req.json();

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        // Server-side fetch of a caller-supplied address is a request forgery
        // primitive: the server can reach places the caller cannot — cloud
        // metadata endpoints, loopback services, anything on the private
        // network. Being an admin does not make that safe, so the destination is
        // restricted to ordinary public web addresses regardless of who asks.
        const blocked = rejectionReason(url);
        if (blocked) {
            return NextResponse.json({ error: blocked }, { status: 400 });
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
