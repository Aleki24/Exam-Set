/**
 * How big an image is, read out of its own bytes.
 *
 * The PDF renderer needs a figure's intrinsic width and height to scale it into
 * the column without distorting it, and `jsPDF` will not tell us — `addImage`
 * takes the dimensions as arguments and stretches to whatever it is given. Get
 * them wrong and a velocity-time graph prints squashed, which for a graph is
 * not a cosmetic problem: the gradient is the answer.
 *
 * Parsed here rather than pulled from a library because it is sixty lines
 * against a dependency, it runs in a serverless function where cold start is
 * the cost that matters, and the three formats the upload control accepts are
 * the three formats below. Anything else returns null and the caller declines
 * to draw it, which is the right outcome for a file we cannot read.
 *
 * Pure and synchronous, so `scripts/verify-image-size.mjs` can exercise it with
 * no storage and no network.
 */

export interface ImageSize {
    width: number;
    height: number;
}

export function imageSize(bytes: Uint8Array): ImageSize | null {
    return jpegSize(bytes) ?? pngSize(bytes) ?? webpSize(bytes);
}

const u16 = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const u32 = (b: Uint8Array, at: number) =>
    ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

/**
 * JPEG — walk the marker chain to the frame header.
 *
 * The size is not at a fixed offset: a JPEG out of a scanner carries EXIF, an
 * ICC profile and a thumbnail before the frame header, and each of those is a
 * variable-length segment that has to be stepped over. So this follows the
 * chain properly rather than guessing, which is why a photo of a textbook page
 * measures the same as a clean crop.
 */
function jpegSize(b: Uint8Array): ImageSize | null {
    if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;

    let at = 2;
    while (at + 9 < b.length) {
        if (b[at] !== 0xff) {
            at += 1; // Fill byte or corruption — resynchronise on the next 0xFF.
            continue;
        }

        const marker = b[at + 1];

        // Standalone markers: no length field to step over.
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
            at += 2;
            continue;
        }
        // Start of scan — the image data begins and there is no header left.
        if (marker === 0xda || marker === 0xd9) return null;

        const length = u16(b, at + 2);
        if (length < 2) return null;

        /*
         * SOF0-SOF15 hold the frame header, except C4 (Huffman tables), C8
         * (reserved) and CC (arithmetic coding conditioning), which share the
         * range and would give nonsense if read as a frame.
         */
        const isFrame =
            marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

        if (isFrame) {
            // length(2) precision(1) height(2) width(2) — note the order in the
            // format is height first, which is the easiest thing here to get
            // backwards and the hardest to notice: a square test image passes.
            return { width: u16(b, at + 7), height: u16(b, at + 5) };
        }

        at += 2 + length;
    }
    return null;
}

/** PNG — IHDR is always the first chunk, at a fixed offset. */
function pngSize(b: Uint8Array): ImageSize | null {
    if (b.length < 24) return null;
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (!sig.every((byte, i) => b[i] === byte)) return null;
    if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR') return null;
    return { width: u32(b, 16), height: u32(b, 20) };
}

/** WebP — three sub-formats under one RIFF container, each storing size differently. */
function webpSize(b: Uint8Array): ImageSize | null {
    if (b.length < 30) return null;
    if (String.fromCharCode(b[0], b[1], b[2], b[3]) !== 'RIFF') return null;
    if (String.fromCharCode(b[8], b[9], b[10], b[11]) !== 'WEBP') return null;

    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);

    // Extended: 24-bit little-endian, stored one less than the real value.
    if (chunk === 'VP8X') {
        const width = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
        const height = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
        return { width, height };
    }

    // Lossy: 14 bits each, after the three-byte start code.
    if (chunk === 'VP8 ') {
        if (!(b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a)) return null;
        return {
            width: (b[26] | (b[27] << 8)) & 0x3fff,
            height: (b[28] | (b[29] << 8)) & 0x3fff,
        };
    }

    // Lossless: 14 bits each, packed across a 32-bit little-endian word.
    if (chunk === 'VP8L') {
        if (b[20] !== 0x2f) return null;
        const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
        return {
            width: 1 + (bits & 0x3fff),
            height: 1 + ((bits >>> 14) & 0x3fff),
        };
    }

    return null;
}
