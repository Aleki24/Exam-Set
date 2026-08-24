#!/usr/bin/env node
/**
 * Skulbase Exams — browser driver.
 *
 *   node .claude/skills/run-exam-set/driver.mjs shots [route...]
 *   node .claude/skills/run-exam-set/driver.mjs flow
 *   node .claude/skills/run-exam-set/driver.mjs console <route>
 *
 * Boots `next start` if nothing is listening, drives real Chromium through
 * Playwright, writes PNGs to .claude/skills/run-exam-set/shots/ and exits
 * non-zero if any route errors.
 *
 * Playwright is installed GLOBALLY in this container, not in the project, so
 * this file resolves it out of /opt/node22/lib/node_modules. Importing it as a
 * bare specifier fails — the project's own node_modules has no copy.
 */

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const SHOTS = join(HERE, 'shots');
const BASE = process.env.SKULBASE_URL || 'http://localhost:3000';
const OWN_SERVER = !process.env.SKULBASE_URL;

// Global install: /opt/node22/lib/node_modules/playwright
const GLOBAL_MODULES = process.env.NODE_GLOBAL_MODULES || '/opt/node22/lib/node_modules';
const require = createRequire(join(GLOBAL_MODULES, 'noop.js'));
let chromium;
try {
    ({ chromium } = require('playwright'));
} catch {
    console.error(
        `Could not load playwright from ${GLOBAL_MODULES}.\n` +
            `Set NODE_GLOBAL_MODULES to the directory containing the global playwright install.`
    );
    process.exit(2);
}

/** Routes that render without any credentials. Signed-in areas are separate. */
const PUBLIC_ROUTES = ['/', '/catalog', '/learn', '/set', '/plans', '/cart', '/auth/login'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function isUp() {
    try {
        const res = await fetch(BASE, { signal: AbortSignal.timeout(4000) });
        return res.ok || res.status < 500;
    } catch {
        return false;
    }
}

/**
 * Serves the PRODUCTION build, not `next dev`.
 *
 * `next dev` compiles each route on first request. /set is a 434 kB first load
 * and took long enough to compile that a multi-route run blew a 400s budget
 * before finishing. `next start` serves prebuilt output, so every route answers
 * immediately and you are also exercising what actually ships.
 *
 * The cost is that you must rebuild after editing. That is the right trade for
 * a harness: run `npm run build` once, then drive as many times as you like.
 */
async function ensureServer() {
    if (await isUp()) return null;
    if (!OWN_SERVER) {
        console.error(`Nothing answering at ${BASE} and SKULBASE_URL was set — not starting a server.`);
        process.exit(2);
    }

    if (!existsSync(join(ROOT, '.next', 'BUILD_ID'))) {
        console.error(
            'No production build found (.next/BUILD_ID missing).\n' +
                '  npm run build\n' +
                'Note: running `next dev` DELETES BUILD_ID, so rebuild after any dev session.'
        );
        process.exit(2);
    }

    console.log('· no server on :3000, starting `next start`…');
    /*
     * `detached: true` puts the server in its own process group so stopServer()
     * can signal the WHOLE group. Without it you kill the wrapper and orphan
     * `next-server`, which keeps port 3000 and — observed here — wedges at 120%
     * CPU and 3 GB RSS. The next run then finds the port taken, Next quietly
     * moves to 3001, and the driver polls 3000 forever until it times out.
     */
    const proc = spawn('npm', ['start'], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
    });
    proc.stdout.on('data', (b) => process.env.DRIVER_VERBOSE && process.stdout.write(`  dev| ${b}`));
    proc.stderr.on('data', (b) => process.env.DRIVER_VERBOSE && process.stderr.write(`  dev! ${b}`));

    for (let i = 0; i < 90; i++) {
        await sleep(1000);
        if (await isUp()) {
            console.log(`· server up after ${i + 1}s`);
            return proc;
        }
    }
    console.error(
        'Server did not come up within 90s.\n' +
            'Most likely an orphaned server already holds :3000 — check with\n' +
            "  ps aux | grep next-server\n" +
            'and clear it with\n' +
            "  pkill -9 -f 'next dev'; pkill -9 -f next-server"
    );
    stopServer(proc);
    process.exit(2);
}

/** Signal the whole process group, not just the npm wrapper. */
function stopServer(proc) {
    if (!proc) return;
    try {
        process.kill(-proc.pid, 'SIGTERM');
    } catch {
        try {
            proc.kill('SIGKILL');
        } catch {
            /* already gone */
        }
    }
}

/**
 * Shop pages paint skeleton placeholders server-side and fetch their real rows
 * from the browser, so `networkidle` alone can screenshot a page full of grey
 * bars. Wait for the skeletons to actually go away, but never fail on it — an
 * empty catalogue legitimately keeps none.
 */
async function settle(page) {
    try {
        await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch {
        /* a page that keeps a socket open is still worth shooting */
    }
    try {
        await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0, {
            timeout: 8000,
        });
    } catch {
        /* still loading, or genuinely empty — shoot it anyway and say so */
    }
    await sleep(400); // let fade-in transitions land
}

function attachDiagnostics(page, bucket) {
    page.on('console', (m) => {
        if (m.type() === 'error') bucket.console.push(m.text().slice(0, 300));
    });
    page.on('pageerror', (e) => bucket.pageerror.push(String(e).slice(0, 300)));
    page.on('response', (r) => {
        if (r.status() >= 400) bucket.http.push(`${r.status()} ${r.url().replace(BASE, '')}`.slice(0, 200));
    });
}

function slug(route) {
    return route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-');
}

/**
 * WHY THIS EXISTS — the blank-page trap.
 *
 * `src/app/layout.tsx` pulls html2pdf from cdnjs with
 * `strategy="beforeInteractive"`, and the page template wrapper starts at
 * `opacity: 0` and is faded in by JS after hydration.
 *
 * In a sandbox with no egress the cdnjs request is reset. Under `next dev`
 * Chromium parses the proxy's HTML error body as JavaScript and throws
 * `SyntaxError: Invalid or unexpected token` BEFORE hydration: React never
 * runs, the opacity is never raised, and you screenshot a perfectly plain
 * background — no error, no content, nothing to explain it.
 *
 * Measured against the PRODUCTION build the page survives without this stub, so
 * it is belt-and-braces on the path the driver actually uses. Keep it anyway:
 * it silences the console noise these dead requests generate, and it keeps the
 * dev path usable. Fonts fall back to system faces, which is cosmetic.
 */
const STUBBED_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

async function stubExternals(ctx) {
    await ctx.route('**/*', (route) => {
        const url = route.request().url();
        if (!STUBBED_HOSTS.some((h) => url.includes(h))) return route.continue();
        const css = url.includes('fonts.googleapis.com');
        return route.fulfill({
            status: 200,
            contentType: css ? 'text/css' : 'application/javascript',
            body: css ? '/* stubbed by driver.mjs */' : '/* stubbed by driver.mjs */',
        });
    });
}

async function withBrowser(fn) {
    const server = await ensureServer();
    mkdirSync(SHOTS, { recursive: true });
    const browser = await chromium.launch({
        // No sandbox: this container runs as root, where Chromium's sandbox refuses to start.
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    if (process.env.DRIVER_NO_STUB !== '1') await stubExternals(ctx);

    // Ctrl-C must not leak a 3 GB next-server into the background.
    const bail = () => {
        stopServer(server);
        process.exit(130);
    };
    process.once('SIGINT', bail);
    process.once('SIGTERM', bail);

    try {
        return await fn(ctx);
    } finally {
        await ctx.close();
        await browser.close();
        stopServer(server);
    }
}

async function cmdShots(routes) {
    const list = routes.length ? routes : PUBLIC_ROUTES;
    let failed = 0;

    await withBrowser(async (ctx) => {
        for (const route of list) {
            const page = await ctx.newPage();
            const bucket = { console: [], pageerror: [], http: [] };
            attachDiagnostics(page, bucket);

            let status = '???';
            try {
                // Generous: a cold route under `next dev` compiles on first visit.
                const res = await page.goto(BASE + route, { waitUntil: 'commit', timeout: 45000 });
                status = res ? res.status() : 'no-response';
                await settle(page);
            } catch (err) {
                status = `THREW ${String(err).split('\n')[0].slice(0, 90)}`;
            }

            const file = join(SHOTS, `${slug(route)}.png`);
            await page.screenshot({ path: file, fullPage: true }).catch(() => {});

            const skeletons = await page.evaluate(() => document.querySelectorAll('.skeleton').length).catch(() => -1);
            const title = await page.title().catch(() => '');
            const bad = status !== 200 || bucket.pageerror.length > 0;
            if (bad) failed++;

            console.log(`${bad ? 'FAIL' : 'ok  '} ${String(status).padEnd(4)} ${route.padEnd(14)} "${title.slice(0, 52)}"`);
            if (skeletons > 0) console.log(`       ${skeletons} skeleton(s) still on screen — no data reached the page`);
            for (const e of bucket.pageerror) console.log(`       pageerror: ${e}`);
            for (const e of bucket.console.slice(0, 3)) console.log(`       console:   ${e}`);
            for (const e of [...new Set(bucket.http)].slice(0, 4)) console.log(`       http:      ${e}`);

            await page.close();
        }
    });

    console.log(`\nshots → ${SHOTS}`);
    process.exit(failed ? 1 : 0);
}

/**
 * One real user journey: land on the catalogue, use the search box, open the
 * setter. Proves the client bundle hydrated and React is actually handling
 * input — a screenshot alone cannot tell you that.
 */
async function cmdFlow() {
    let failed = 0;
    await withBrowser(async (ctx) => {
        const page = await ctx.newPage();
        const bucket = { console: [], pageerror: [], http: [] };
        attachDiagnostics(page, bucket);

        const step = async (label, fn) => {
            try {
                await fn();
                console.log(`ok   ${label}`);
            } catch (err) {
                failed++;
                console.log(`FAIL ${label}: ${String(err).split('\n')[0].slice(0, 120)}`);
            }
        };

        await step('catalogue loads', async () => {
            await page.goto(`${BASE}/catalog`, { waitUntil: 'commit', timeout: 45000 });
            await settle(page);
            await page.waitForSelector('header', { timeout: 10000 });
        });

        await step('nav is hydrated (Set an exam is a real link)', async () => {
            const href = await page.getAttribute('a[href="/set"]', 'href');
            if (href !== '/set') throw new Error(`expected /set, got ${href}`);
        });

        await step('search box accepts typing', async () => {
            const box = page.locator('input[type="search"], input[placeholder*="earch" i]').first();
            await box.waitFor({ timeout: 10000 });
            await box.fill('Grade 4 Social Studies');
            await sleep(1200);
            const val = await box.inputValue();
            if (!val.includes('Grade 4')) throw new Error(`input did not hold value: "${val}"`);
        });

        await page.screenshot({ path: join(SHOTS, 'flow-catalog-search.png'), fullPage: true }).catch(() => {});

        await step('setter opens', async () => {
            await page.goto(`${BASE}/set`, { waitUntil: 'commit', timeout: 60000 });
            await settle(page);
            await page.waitForSelector('h1, [class*="display"]', { timeout: 15000 });
        });

        await page.screenshot({ path: join(SHOTS, 'flow-setter.png'), fullPage: true }).catch(() => {});

        if (bucket.pageerror.length) {
            failed++;
            for (const e of bucket.pageerror) console.log(`FAIL pageerror: ${e}`);
        }
        await page.close();
    });

    console.log(`\nshots → ${SHOTS}`);
    process.exit(failed ? 1 : 0);
}

async function cmdConsole(route) {
    await withBrowser(async (ctx) => {
        const page = await ctx.newPage();
        const bucket = { console: [], pageerror: [], http: [] };
        page.on('console', (m) => bucket.console.push(`[${m.type()}] ${m.text().slice(0, 300)}`));
        page.on('pageerror', (e) => bucket.pageerror.push(String(e).slice(0, 300)));
        page.on('response', (r) => r.status() >= 400 && bucket.http.push(`${r.status()} ${r.url()}`));
        await page.goto(BASE + route, { waitUntil: 'commit', timeout: 45000 });
        await settle(page);
        console.log(`--- console (${bucket.console.length}) ---`);
        bucket.console.forEach((l) => console.log(l));
        console.log(`--- pageerror (${bucket.pageerror.length}) ---`);
        bucket.pageerror.forEach((l) => console.log(l));
        console.log(`--- http >=400 (${bucket.http.length}) ---`);
        [...new Set(bucket.http)].forEach((l) => console.log(l));
        await page.close();
    });
}

const [cmd, ...rest] = process.argv.slice(2);
if (!existsSync(join(ROOT, 'package.json'))) {
    console.error(`Expected the project root at ${ROOT} — run this from inside the repo.`);
    process.exit(2);
}

switch (cmd) {
    case 'shots':
        await cmdShots(rest);
        break;
    case 'flow':
        await cmdFlow();
        break;
    case 'console':
        if (!rest[0]) {
            console.error('usage: driver.mjs console <route>');
            process.exit(2);
        }
        await cmdConsole(rest[0]);
        break;
    default:
        console.log(`usage:
  driver.mjs shots [route...]   screenshot routes (default: ${PUBLIC_ROUTES.join(' ')})
  driver.mjs flow               drive one real user journey through the shop
  driver.mjs console <route>    dump console / pageerror / failed requests

env:
  SKULBASE_URL     drive a deployed site instead of booting a local server
  DRIVER_VERBOSE=1 stream the server's output
  DRIVER_NO_STUB=1 do NOT stub cdnjs/Google Fonts (blank pages without egress)

Needs a production build first: npm run build`);
        process.exit(2);
}
