/**
 * Verification harness for question figures.
 *
 *   node scripts/verify-figures.mjs
 *
 * Two things are being checked, and they fail in opposite directions.
 *
 * KEY MINTING is a security boundary. `figureKeyForType` interpolates a caller-
 * supplied id into a storage key, and that key becomes a signed PUT. If it ever
 * accepts something that is not a UUID, an admin — or anything holding an admin
 * session — can be handed permission to overwrite an arbitrary object in a
 * bucket that holds every paid PDF in the catalogue.
 *
 * IMAGE SIZING is a correctness boundary. Get a figure's dimensions wrong and
 * the PDF renderer stretches a velocity-time graph, which changes its gradient
 * — and the gradient is the answer. Wrong here means a wrong answer printed on
 * something somebody paid for.
 *
 * No network, no storage, no database.
 */

import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
    alias: { '@': new URL('../src', import.meta.url).pathname },
    interopDefault: true,
});

const { figureKeyForType, figureExtension, isFigureKey, isQuestionId, FIGURE_PREFIX } =
    await jiti.import('../src/lib/figures.ts');
const { imageSize } = await jiti.import('../src/services/imageSize.ts');

let failures = 0;
let checks = 0;

/** Key order is not a result. Sorting keys stops a reordered object failing. */
function stable(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    return `{${Object.keys(value)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
        .join(',')}}`;
}

function check(label, actual, expected) {
    checks++;
    const ok = stable(actual) === stable(expected);
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(56)} ${
            ok ? '' : `got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`
        }`
    );
}

const UUID = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';

console.log('\nA key can only ever be minted for a real question and a real image');
{
    check('a UUID and a JPEG', figureKeyForType(UUID, 'image/jpeg'), `${FIGURE_PREFIX}${UUID}.jpg`);
    check('PNG keeps its own extension', figureKeyForType(UUID, 'image/png'), `${FIGURE_PREFIX}${UUID}.png`);
    check('WebP too', figureKeyForType(UUID, 'image/webp'), `${FIGURE_PREFIX}${UUID}.webp`);
    check('case and spacing do not matter', figureKeyForType(UUID, ' IMAGE/JPEG '), `${FIGURE_PREFIX}${UUID}.jpg`);

    // The whole point of the function.
    check('a PDF is refused', figureKeyForType(UUID, 'application/pdf'), null);
    check('SVG is refused — it is a script', figureKeyForType(UUID, 'image/svg+xml'), null);
    check('no content type at all', figureKeyForType(UUID, ''), null);

    check('path traversal cannot mint a key', figureKeyForType('../papers/x', 'image/jpeg'), null);
    check('a bare word cannot', figureKeyForType('paper', 'image/jpeg'), null);
    check('an empty id cannot', figureKeyForType('', 'image/jpeg'), null);
    check('a slash inside a UUID cannot', figureKeyForType(`${UUID}/x`, 'image/jpeg'), null);
    check('a UUID with a suffix cannot', figureKeyForType(`${UUID}x`, 'image/jpeg'), null);
    check('a truncated UUID cannot', figureKeyForType(UUID.slice(0, 30), 'image/jpeg'), null);

    check('every minted key passes the read guard', isFigureKey(figureKeyForType(UUID, 'image/png')), true);
    check('and a paper key does not', isFigureKey('papers/someone/2026-maths.pdf'), false);
    check('and neither does a traversal', isFigureKey('figures/../papers/x.pdf'), false);
}

console.log('\nThe id check is the only thing guarding the key');
{
    check('a real UUID', isQuestionId(UUID), true);
    check('uppercase is still a UUID', isQuestionId(UUID.toUpperCase()), true);
    check('leading whitespace is not', isQuestionId(` ${UUID}`), false);
    check('trailing newline is not', isQuestionId(`${UUID}\n`), false);
    check('a number is not', isQuestionId('12345'), false);
}

console.log('\nContent types map to exactly one extension each');
{
    check('jpeg', figureExtension('image/jpeg'), 'jpg');
    check('png', figureExtension('image/png'), 'png');
    check('webp', figureExtension('image/webp'), 'webp');
    check('gif is not accepted', figureExtension('image/gif'), null);
    check('a lie about the type is not accepted', figureExtension('image/jpeg; charset=evil'), null);
}

// ---------------------------------------------------------------------------
// Image dimensions, built byte by byte so the harness needs no fixture files.
// ---------------------------------------------------------------------------

/** A minimal but structurally real JPEG: APP0, a comment, then SOF0. */
function jpeg(width, height, { padding = 0 } = {}) {
    const bytes = [0xff, 0xd8];

    // APP0/JFIF, and a COM segment, so the parser has to walk the chain rather
    // than read a fixed offset. This is what a scanner's output looks like.
    bytes.push(0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0);
    if (padding > 0) {
        const length = padding + 2;
        bytes.push(0xff, 0xfe, (length >> 8) & 0xff, length & 0xff, ...new Array(padding).fill(0x20));
    }

    bytes.push(
        0xff, 0xc0, 0x00, 0x11, 0x08,
        (height >> 8) & 0xff, height & 0xff,
        (width >> 8) & 0xff, width & 0xff,
        3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1
    );
    return new Uint8Array(bytes);
}

function png(width, height) {
    const b = new Uint8Array(24);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    b.set([0, 0, 0, 13], 8);
    b.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
    new DataView(b.buffer).setUint32(16, width);
    new DataView(b.buffer).setUint32(20, height);
    return b;
}

function webpExtended(width, height) {
    const b = new Uint8Array(30);
    b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
    b.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8);
    b.set([...'VP8X'].map((c) => c.charCodeAt(0)), 12);
    const w = width - 1;
    const h = height - 1;
    b.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff], 24);
    b.set([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 27);
    return b;
}

function webpLossy(width, height) {
    const b = new Uint8Array(30);
    b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
    b.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8);
    b.set([...'VP8 '].map((c) => c.charCodeAt(0)), 12);
    b.set([0x9d, 0x01, 0x2a], 23);
    b.set([width & 0xff, (width >> 8) & 0x3f], 26);
    b.set([height & 0xff, (height >> 8) & 0x3f], 28);
    return b;
}

console.log('\nDimensions are read out of the bytes, whatever the format');
{
    check('a plain JPEG', imageSize(jpeg(800, 600)), { width: 800, height: 600 });
    check('a JPEG behind a comment segment', imageSize(jpeg(1240, 1754, { padding: 300 })), {
        width: 1240,
        height: 1754,
    });
    check('a tall crop, not silently swapped', imageSize(jpeg(400, 1200)), { width: 400, height: 1200 });
    check('a wide crop', imageSize(jpeg(1200, 400)), { width: 1200, height: 400 });
    check('a PNG', imageSize(png(1024, 768)), { width: 1024, height: 768 });
    check('a square PNG', imageSize(png(512, 512)), { width: 512, height: 512 });
    check('an extended WebP', imageSize(webpExtended(640, 480)), { width: 640, height: 480 });
    check('a lossy WebP', imageSize(webpLossy(320, 240)), { width: 320, height: 240 });
}

console.log('\nAnything unreadable says so, rather than guessing');
{
    check('empty input', imageSize(new Uint8Array(0)), null);
    check('a PDF', imageSize(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])), null);
    check('a truncated JPEG header', imageSize(new Uint8Array([0xff, 0xd8, 0xff])), null);
    check('a JPEG that reaches its scan with no frame', imageSize(new Uint8Array([
        0xff, 0xd8, 0xff, 0xda, 0x00, 0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ])), null);
    check('a PNG signature with no IHDR', imageSize(new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
        0x49, 0x44, 0x41, 0x54, 0, 0, 0, 1, 0, 0, 0, 1,
    ])), null);
    check('RIFF that is not WebP', imageSize(new Uint8Array([
        ...[...'RIFF'].map((c) => c.charCodeAt(0)), 0, 0, 0, 0,
        ...[...'WAVE'].map((c) => c.charCodeAt(0)), ...new Array(18).fill(0),
    ])), null);
}

console.log(
    failures === 0
        ? `\nAll ${checks} figure checks passed.\n`
        : `\n${failures} of ${checks} figure checks FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
