/**
 * MAKING TEXT SAFE FOR A STANDARD-14 FONT
 * ----------------------------------------------------------------------------
 * A maths paper printed "Evaluate 3(2x " 4) " 5(x + 1)" and set the whole line
 * in letter-spaced type. Both symptoms are one bug, and it is jsPDF's.
 *
 * The standard-14 fonts carry WinAnsi (cp1252) and nothing else. Hand jsPDF a
 * string containing any character outside it — a real minus sign, U+2212, is
 * the commonest — and it silently re-encodes THE WHOLE STRING as UTF-16BE. The
 * viewer, reading a WinAnsi font, then interprets it a byte at a time:
 *
 *     "A−B"  →  00 41 22 12 00 42  →  "␀A" ␄ "␀B"
 *
 * So the minus prints as a quotation mark, and the NUL byte before every other
 * letter opens a gap — which is the letter-spacing. `getTextWidth` returns a
 * flat 5.61 for every unsupported character too, so line wrapping is measured
 * against the wrong widths as well. One stray glyph corrupts a whole line.
 *
 * WHY TRANSLITERATE RATHER THAN EMBED A UNICODE FONT
 *
 * Embedding one is the textbook answer and the wrong trade here. A subsetted
 * Unicode face is a few hundred kilobytes riding on every paper — and this
 * renderer's whole reason for using text primitives instead of rasterised HTML
 * is that a paper is tens of kilobytes and downloads over a Kenyan mobile
 * connection. The characters that actually turn up in a school paper have
 * unambiguous plain-text spellings that a teacher writes by hand anyway.
 *
 * Applied at the PDF boundary only. The on-screen preview is HTML and should
 * keep its real √ and π; it is only the printed document that cannot hold them.
 */

/**
 * The characters cp1252 has above Latin-1 — curly quotes, dashes, the ellipsis.
 * These pass through untouched; everything else above U+00FF does not.
 */
const WINANSI_ABOVE_LATIN1 = new Set([
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
    0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122,
    0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

function inWinAnsi(code: number): boolean {
    if (code >= 0x20 && code <= 0x7e) return true;
    // U+0080–U+009F are control codes with no cp1252 glyph; A0 upward are Latin-1.
    if (code >= 0xa0 && code <= 0xff) return true;
    return WINANSI_ABOVE_LATIN1.has(code);
}

/**
 * What each unprintable character becomes.
 *
 * Chosen to be what a Kenyan teacher would write on a blackboard, not the
 * shortest escape. "sqrt" beats dropping the radical; "->" beats an arrow that
 * would take the line with it.
 *
 * Note what is NOT here: ° ± × ÷ µ · ² ³ ¹ ½ ¼ ¾ are all in cp1252 already and
 * print correctly. Half of a science paper's symbols never needed touching.
 */
const TRANSLITERATIONS: Readonly<Record<string, string>> = Object.freeze({
    // Dashes and minus. U+2212 is the one that breaks maths papers.
    '−': '-', '‐': '-', '‑': '-', '‒': '-', '―': '-',
    '⁄': '/',

    // Relations.
    '≤': '<=', '≥': '>=', '≠': '=/=', '≈': '~', '≡': '=',
    '∝': ' proportional to ',

    // Operators and constants.
    '√': 'sqrt', 'π': 'pi', '∞': 'infinity', '∑': 'sum',
    '∫': 'integral', '∆': 'delta', 'Δ': 'delta', '∂': 'd',
    '∴': 'therefore', '∵': 'because',

    // Greek that carries meaning in physics and maths.
    'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'θ': 'theta',
    'λ': 'lambda', 'ρ': 'rho', 'σ': 'sigma', 'ω': 'omega',
    'Ω': 'ohms', 'Σ': 'sum', 'Φ': 'phi',

    // Arrows. The chemistry equilibrium arrows matter — they are the answer to
    // a whole class of Form 3 questions.
    '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '⇔': '<=>',
    '⇌': '<=>', '⇄': '<=>', '↑': '(up)', '↓': '(down)',

    // Superscripts and subscripts. H₂SO₄ must not lose its numbers.
    '⁰': '^0', '⁴': '^4', '⁵': '^5', '⁶': '^6', '⁷': '^7',
    '⁸': '^8', '⁹': '^9', '⁺': '+', '⁻': '-', 'ⁿ': '^n',
    '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
    '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',

    // Sets and logic, for the Form 4 topic that uses them.
    '∪': ' U ', '∩': ' n ', '∈': ' is in ', '∉': ' is not in ',
    '⊂': ' subset of ', '⊆': ' subset of ', '∅': '{ }',

    // Spaces that are not spaces.
    ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', '​': '',
    '﻿': '',

    // Quotes and marks a word processor inserts.
    '′': "'", '″': '"', '­': '',
});

/**
 * A string a standard-14 font can actually print.
 *
 * Anything left over after transliteration is dropped rather than passed
 * through. A missing character costs one glyph; letting it through costs the
 * line it sits on, and the widths every line after it was wrapped against.
 */
export function pdfSafe<T>(value: T): T {
    if (typeof value === 'string') return sanitise(value) as unknown as T;
    if (Array.isArray(value)) return value.map((entry) => pdfSafe(entry)) as unknown as T;
    return value;
}

function sanitise(value: string): string {
    // The overwhelmingly common case is a string that is already fine, and
    // rebuilding every one of them character by character would be paid on
    // every line of every paper.
    if (isSafe(value)) return value;

    let out = '';
    for (const ch of value) {
        const code = ch.codePointAt(0)!;
        if (inWinAnsi(code) || code === 0x0a) {
            out += ch;
            continue;
        }
        out += TRANSLITERATIONS[ch] ?? '';
    }
    return out;
}

function isSafe(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code === 0x0a) continue;
        if (!inWinAnsi(code)) return false;
    }
    return true;
}

/** Exposed for the harness: does this string need rewriting before it prints? */
export function needsTransliteration(value: string): boolean {
    return !isSafe(value);
}
