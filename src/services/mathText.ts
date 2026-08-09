/**
 * MATHS, PARSED
 * ----------------------------------------------------------------------------
 * A maths paper is not prose with symbols sprinkled in. A fraction is stacked,
 * an index is raised, a surd sits under a bar — and printing `\frac{3x+2}{x-1}`
 * as those literal characters, which is what this renderer did until now, is
 * worse than useless: it is a question no candidate can read.
 *
 * The setter already accepts `$...$` LaTeX and renders it with KaTeX on screen,
 * so the notation is settled and this changes nothing about how a question is
 * written. What was missing is the other half — the printed paper.
 *
 * This file is the parser and nothing else: LaTeX in, a tree out, no fonts and
 * no jsPDF. Measuring and drawing live in `mathDraw.ts`, because those need a
 * document and this needs to stay testable without one.
 *
 * THE SUBSET
 *
 * Deliberately small. It covers what appears in a Kenyan school paper from
 * Grade 4 to Form 4 — fractions, indices, subscripts, surds, the Greek letters
 * that carry meaning, and the relation and operator symbols. It does not cover
 * matrices, integrals with limits, or alignment environments, because a paper
 * that needs those needs a typesetter and not this. Anything unrecognised is
 * printed as its own text rather than dropped, so a question is never silently
 * emptied.
 */

export type MathNode =
    /** Set in the document's serif text font. */
    | { kind: 'text'; value: string }
    /** Set in the Symbol standard-14 font, which is where √ π ≤ ≥ ≠ live. */
    | { kind: 'sym'; code: number }
    | { kind: 'frac'; num: MathNode[]; den: MathNode[] }
    | { kind: 'sup'; body: MathNode[] }
    | { kind: 'sub'; body: MathNode[] }
    | { kind: 'sqrt'; body: MathNode[]; index: MathNode[] | null }
    /** Horizontal space, as a fraction of the current font size. */
    | { kind: 'space'; em: number };

/**
 * Adobe Symbol encoding, verified glyph by glyph against a rendered chart
 * rather than taken from a table — several widely-repeated tables are wrong
 * about 0xBB, which is `approxequal` and not an arrow.
 *
 * Using this font is what makes real symbols possible at all. The standard-14
 * text fonts carry WinAnsi, which has no √, no π and no ≤; the alternative was
 * embedding a Unicode face at a few hundred kilobytes on every download.
 */
export const SYM = {
    alpha: 0x61, beta: 0x62, gamma: 0x67, delta: 0x64, epsilon: 0x65,
    phi: 0x66, lambda: 0x6c, mu: 0x6d, pi: 0x70, theta: 0x71,
    rho: 0x72, sigma: 0x73, tau: 0x74, omega: 0x77,
    Delta: 0x44, Phi: 0x46, Sigma: 0x53, Omega: 0x57, Pi: 0x50, Theta: 0x51,
    radical: 0xd6, le: 0xa3, ge: 0xb3, ne: 0xb9, approx: 0xbb,
    to: 0xae, infinity: 0xa5, times: 0xb4, div: 0xb8, plusminus: 0xb1,
    dot: 0xb7, integral: 0xf2, equiv: 0xba, angle: 0xd0, minus: 0x2d,
    nabla: 0xd1, cup: 0xc8, subseteq: 0xcd,
} as const;

/**
 * Advance widths for the Symbol glyphs above, per 1000 units of font size.
 *
 * Shipped because jsPDF has no metrics for this font at all: `getTextWidth`
 * answers a flat 580 for every glyph in it, so π was drawn over whatever
 * followed it and an ∫ left a hole. Positioning here is absolute — each glyph
 * is placed at a coordinate this file computes — so these numbers ARE the
 * layout, and a wrong one is a visible collision.
 *
 * MEASURED, NOT TRANSCRIBED
 *
 * Every value below was obtained by rendering the glyph at 200pt and scanning
 * the raster for its ink extent, then adding a right bearing mirroring the
 * measured left one. Transcribing the Adobe AFM from memory got γ wrong by a
 * quarter of an em (411 against a real 508) and left almost every other glyph
 * a percent or two tight, which is exactly enough for a descender to touch the
 * next character at body size. The floor means a glyph can never be set
 * narrower than the ink it actually puts on the page.
 */
export const SYMBOL_WIDTHS: Readonly<Record<number, number>> = Object.freeze({
    [SYM.minus]: 560, [SYM.alpha]: 663, [SYM.beta]: 575, [SYM.gamma]: 508,
    [SYM.delta]: 520, [SYM.epsilon]: 453, [SYM.phi]: 518, [SYM.lambda]: 573,
    [SYM.mu]: 601, [SYM.pi]: 555, [SYM.theta]: 528, [SYM.rho]: 540,
    [SYM.sigma]: 618, [SYM.tau]: 443, [SYM.omega]: 728, [SYM.Delta]: 633,
    [SYM.Phi]: 765, [SYM.Sigma]: 615, [SYM.Omega]: 770, [SYM.Pi]: 770,
    [SYM.Theta]: 755, [SYM.radical]: 540, [SYM.le]: 555, [SYM.ge]: 555,
    [SYM.ne]: 565, [SYM.approx]: 553, [SYM.to]: 1008, [SYM.infinity]: 713,
    [SYM.times]: 558, [SYM.div]: 560, [SYM.plusminus]: 565, [SYM.dot]: 460,
    [SYM.integral]: 315, [SYM.equiv]: 563, [SYM.angle]: 766, [SYM.nabla]: 718,
    [SYM.cup]: 773, [SYM.subseteq]: 728,
});

/** Fallback for a glyph not in the table. Close to the font's average. */
export const SYMBOL_DEFAULT_WIDTH = 549;

/** Relations get the widest gap on both sides; TeX calls this `thickmuskip`. */
const RELATION_SYMS = new Set<number>([SYM.le, SYM.ge, SYM.ne, SYM.approx, SYM.equiv, SYM.to]);
const RELATION_TEXT = new Set(['=', '<', '>']);

/** True for a node that must stay a node of its own. */
const isOperatorText = (value: string): boolean =>
    RELATION_TEXT.has(value) || BINARY_TEXT.has(value);

/** Binary operators get a smaller gap, and none at all when they are unary. */
const BINARY_SYMS = new Set<number>([SYM.times, SYM.div, SYM.plusminus, SYM.minus, SYM.dot]);
const BINARY_TEXT = new Set(['+']);

/** `\command` → a Symbol glyph. */
const SYMBOL_COMMANDS: Readonly<Record<string, number>> = Object.freeze({
    alpha: SYM.alpha, beta: SYM.beta, gamma: SYM.gamma, delta: SYM.delta,
    epsilon: SYM.epsilon, varepsilon: SYM.epsilon, phi: SYM.phi, varphi: SYM.phi,
    lambda: SYM.lambda, mu: SYM.mu, pi: SYM.pi, theta: SYM.theta,
    rho: SYM.rho, sigma: SYM.sigma, tau: SYM.tau, omega: SYM.omega,
    Delta: SYM.Delta, Phi: SYM.Phi, Sigma: SYM.Sigma, Omega: SYM.Omega,
    Pi: SYM.Pi, Theta: SYM.Theta,

    times: SYM.times, div: SYM.div, pm: SYM.plusminus, cdot: SYM.dot,
    le: SYM.le, leq: SYM.le, ge: SYM.ge, geq: SYM.ge,
    ne: SYM.ne, neq: SYM.ne, approx: SYM.approx, equiv: SYM.equiv,
    infty: SYM.infinity, to: SYM.to, rightarrow: SYM.to,
    angle: SYM.angle, cup: SYM.cup, subseteq: SYM.subseteq, subset: SYM.subseteq,
    int: SYM.integral, sum: SYM.Sigma, prod: SYM.Pi, nabla: SYM.nabla,
});

/** `\command` → literal text, for the things WinAnsi already has. */
const TEXT_COMMANDS: Readonly<Record<string, string>> = Object.freeze({
    circ: '°', degree: '°', percent: '%', '%': '%',
    $: '$', '&': '&', '#': '#', _: '_', '{': '{', '}': '}',
    ldots: '…', dots: '…', cdots: '…', quad: '  ', qquad: '    ',
});

/** Set upright and followed by a thin space, the way TeX sets them. */
const FUNCTION_NAMES = new Set([
    'sin', 'cos', 'tan', 'sec', 'cosec', 'cot', 'log', 'ln', 'lg', 'exp', 'max', 'min',
]);

/** Commands that take one group and set it upright. */
const TEXT_GROUP_COMMANDS = new Set(['text', 'mathrm', 'textrm', 'mbox', 'operatorname']);

/** Thin spaces. */
const SPACE_COMMANDS: Readonly<Record<string, number>> = Object.freeze({
    ',': 0.17, ';': 0.28, ':': 0.22, '!': -0.17, ' ': 0.25,
});

/** Dropped entirely — they size delimiters, and these delimiters are one line tall. */
const IGNORED_COMMANDS = new Set(['left', 'right', 'displaystyle', 'textstyle', 'limits', 'nolimits', 'big', 'Big', 'bigg', 'Bigg']);

// ---------------------------------------------------------------------------
// PARSER
// ---------------------------------------------------------------------------

class Reader {
    constructor(
        readonly src: string,
        public at = 0
    ) {}

    get done(): boolean {
        return this.at >= this.src.length;
    }

    peek(): string {
        return this.src[this.at] ?? '';
    }

    next(): string {
        return this.src[this.at++] ?? '';
    }

    /** Reads `\name`, having already consumed the backslash. */
    command(): string {
        const rest = this.src.slice(this.at);
        const word = /^[a-zA-Z]+/.exec(rest);
        if (word) {
            this.at += word[0].length;
            /*
             * LaTeX swallows the space that ends a command name — it is what
             * separates `\pi` from the `r` after it, not a gap the author
             * asked for. Keeping it printed "V = p r2 h" with a hole in it.
             */
            this.skipSpace();
            return word[0];
        }
        // A single-character command such as `\,` or `\%`.
        return this.next();
    }

    /**
     * The next argument: a braced group, a single command, or one character.
     *
     * `x^2` and `x^{2n}` both have to work, because a teacher writes both.
     */
    group(): MathNode[] {
        this.skipSpace();
        if (this.peek() === '{') {
            this.next();
            const nodes = parseUntil(this, '}');
            if (this.peek() === '}') this.next();
            return nodes;
        }
        if (this.peek() === '\\') {
            this.next();
            const node = fromCommand(this, this.command());
            return node;
        }
        if (this.done) return [];
        return [{ kind: 'text', value: this.next() }];
    }

    /** An optional `[...]` argument, as on `\sqrt[3]{8}`. */
    optional(): MathNode[] | null {
        this.skipSpace();
        if (this.peek() !== '[') return null;
        this.next();
        const nodes = parseUntil(this, ']');
        if (this.peek() === ']') this.next();
        return nodes;
    }

    skipSpace(): void {
        while (!this.done && this.peek() === ' ') this.at++;
    }
}

function fromCommand(r: Reader, name: string): MathNode[] {
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        return [{ kind: 'frac', num: r.group(), den: r.group() }];
    }
    if (name === 'sqrt') {
        const index = r.optional();
        return [{ kind: 'sqrt', body: r.group(), index }];
    }
    if (TEXT_GROUP_COMMANDS.has(name)) {
        return r.group();
    }
    if (FUNCTION_NAMES.has(name)) {
        // "sin θ", not "sinθ". TeX spaces an operator name from its argument
        // and the paper looks wrong without it.
        return [{ kind: 'text', value: name }, { kind: 'space', em: 0.17 }];
    }
    if (name in SYMBOL_COMMANDS) {
        return [{ kind: 'sym', code: SYMBOL_COMMANDS[name] }];
    }
    if (name in SPACE_COMMANDS) {
        return [{ kind: 'space', em: SPACE_COMMANDS[name] }];
    }
    if (name in TEXT_COMMANDS) {
        const value = TEXT_COMMANDS[name];
        return value ? [{ kind: 'text', value }] : [];
    }
    if (IGNORED_COMMANDS.has(name)) return [];

    /*
     * Unknown. Printed as its own name rather than dropped: a question that
     * loses a term is wrong in a way nobody can see, where one showing a stray
     * word is obviously wrong and gets fixed in review.
     */
    return [{ kind: 'text', value: name }];
}

function parseUntil(r: Reader, stop: string): MathNode[] {
    const out: MathNode[] = [];

    /** Attaches a script to whatever came last, so `x^2` binds to the x. */
    const attach = (kind: 'sup' | 'sub') => {
        const body = r.group();
        /*
         * `^\circ` is how everybody writes degrees, but ° is already a raised
         * glyph — putting it in a superscript raises it twice and it floats
         * off the top of the line. It goes on the baseline as itself.
         */
        if (kind === 'sup' && body.length === 1 && body[0].kind === 'text' && body[0].value === '°') {
            out.push(body[0]);
            return;
        }
        out.push({ kind, body });
    };

    while (!r.done && r.peek() !== stop) {
        const ch = r.peek();

        if (ch === '\\') {
            r.next();
            out.push(...fromCommand(r, r.command()));
            continue;
        }
        if (ch === '^') {
            r.next();
            attach('sup');
            continue;
        }
        if (ch === '_') {
            r.next();
            attach('sub');
            continue;
        }
        if (ch === '{') {
            r.next();
            out.push(...parseUntil(r, '}'));
            if (r.peek() === '}') r.next();
            continue;
        }
        if (ch === '-') {
            // A real minus, not a hyphen. In maths the difference is visible
            // and it is the character this whole area got wrong before.
            r.next();
            out.push({ kind: 'sym', code: SYM.minus });
            continue;
        }
        if (RELATION_TEXT.has(ch) || BINARY_TEXT.has(ch)) {
            // Kept out of the running text node so `applyMathSpacing` can find
            // it. Merged in, an `=` is invisible inside "V = ".
            r.next();
            out.push({ kind: 'text', value: ch });
            continue;
        }

        r.next();
        /*
         * Merge runs of plain characters so the drawing side makes one call per
         * word rather than one per letter — but never into an operator node.
         * `=` is pushed on its own above precisely so the spacing pass can see
         * it, and letting the space after it merge in turned the node into
         * "= ", which matches nothing and printed "V= x".
         */
        const last = out[out.length - 1];
        if (last && last.kind === 'text' && !isOperatorText(last.value)) last.value += ch;
        else out.push({ kind: 'text', value: ch });
    }

    return out;
}

/** LaTeX (without the surrounding `$`) to a node tree. */
export function parseMath(latex: string): MathNode[] {
    return applyMathSpacing(parseUntil(new Reader(String(latex ?? '')), '\0'));
}

const isRelation = (n: MathNode): boolean =>
    (n.kind === 'sym' && RELATION_SYMS.has(n.code)) ||
    (n.kind === 'text' && RELATION_TEXT.has(n.value));

const isBinary = (n: MathNode): boolean =>
    (n.kind === 'sym' && BINARY_SYMS.has(n.code)) ||
    (n.kind === 'text' && BINARY_TEXT.has(n.value));

/**
 * The gaps around operators, which are most of what makes maths look set
 * rather than typed.
 *
 * "V=pr2h" and "V = πr² h" are the same characters. TeX puts a wide gap either
 * side of a relation and a narrower one either side of a binary operator, and
 * none at all around juxtaposition — which is why πr has no gap but π = has
 * one. Doing it here rather than trusting the author's spaces also fixes the
 * space LaTeX eats after a command name: `\pi = x` loses the space before the
 * `=` and would otherwise print "π= x".
 *
 * A leading minus is unary — the sign of the number, not a subtraction — and
 * takes no space. That is the difference between "−b ± √…" and "− b ± √…".
 */
function applyMathSpacing(nodes: MathNode[]): MathNode[] {
    const out: MathNode[] = [];

    /** The last thing that could be a left operand, ignoring spaces. */
    const previous = (): MathNode | null => {
        for (let i = out.length - 1; i >= 0; i--) {
            if (out[i].kind !== 'space') return out[i];
        }
        return null;
    };

    for (const node of nodes) {
        // Recurse so a fraction's numerator is spaced like anything else.
        const spaced: MathNode =
            node.kind === 'frac'
                ? { ...node, num: applyMathSpacing(node.num), den: applyMathSpacing(node.den) }
                : node.kind === 'sqrt'
                  ? {
                        ...node,
                        body: applyMathSpacing(node.body),
                        index: node.index ? applyMathSpacing(node.index) : null,
                    }
                  : node.kind === 'sup' || node.kind === 'sub'
                    ? { ...node, body: applyMathSpacing(node.body) }
                    : node;

        const relation = isRelation(spaced);
        const binary = isBinary(spaced);

        if (relation || binary) {
            const before = previous();
            /*
             * Nothing to the left, or another operator to the left, means this
             * is a sign rather than an operation. `-b`, `(-3)`, `= -x`.
             */
            const unary =
                !before ||
                isRelation(before) ||
                isBinary(before) ||
                (before.kind === 'text' && /[([{,]$/.test(before.value));

            if (binary && unary) {
                out.push(spaced);
                continue;
            }

            const em = relation ? 0.26 : 0.2;
            trimTrailingSpace(out);
            out.push({ kind: 'space', em }, spaced, { kind: 'space', em });
            continue;
        }

        /*
         * An author's own space next to one we inserted would double it —
         * "x - 4" already has a space after the minus, and adding TeX's gap on
         * top set it as "x -  4".
         */
        if (spaced.kind === 'text' && out.length > 0 && out[out.length - 1].kind === 'space') {
            if (/^\s+$/.test(spaced.value)) continue;
            const trimmed = spaced.value.replace(/^\s+/, '');
            out.push({ kind: 'text', value: trimmed });
            continue;
        }

        out.push(spaced);
    }

    return out;
}

function trimTrailingSpace(out: MathNode[]): void {
    while (out.length > 0) {
        const last = out[out.length - 1];
        if (last.kind === 'space') { out.pop(); continue; }
        if (last.kind === 'text' && /^\s+$/.test(last.value)) { out.pop(); continue; }
        if (last.kind === 'text' && /\s$/.test(last.value)) {
            last.value = last.value.replace(/\s+$/, '');
            if (last.value === '') out.pop();
            return;
        }
        return;
    }
}

// ---------------------------------------------------------------------------
// SPLITTING A QUESTION INTO PROSE AND MATHS
// ---------------------------------------------------------------------------

export type Segment =
    | { kind: 'prose'; text: string }
    | { kind: 'math'; nodes: MathNode[] };

/**
 * A question, split on `$…$`.
 *
 * `$$…$$` is treated the same as `$…$`: a displayed equation on its own line is
 * a refinement, and setting it inline is right far more often than it is wrong
 * on a paper where almost every expression sits inside a sentence.
 *
 * An unclosed `$` is left as prose. Someone writing "costs $5" has not written
 * maths, and swallowing the rest of the question would be a much worse failure
 * than printing one stray dollar sign.
 */
export function segmentText(value: string): Segment[] {
    const src = String(value ?? '');
    if (!src.includes('$')) return src ? [{ kind: 'prose', text: src }] : [];

    const out: Segment[] = [];
    const re = /\$\$([\s\S]*?)\$\$|\$([^\n$]+?)\$/g;
    let last = 0;
    let match: RegExpExecArray | null;

    while ((match = re.exec(src)) !== null) {
        if (match.index > last) out.push({ kind: 'prose', text: src.slice(last, match.index) });
        out.push({ kind: 'math', nodes: parseMath(match[1] ?? match[2] ?? '') });
        last = match.index + match[0].length;
    }

    if (last < src.length) out.push({ kind: 'prose', text: src.slice(last) });
    return out.filter((s) => s.kind === 'math' || s.text.length > 0);
}

/** Whether anything in this string needs the maths typesetter at all. */
export function hasMath(value: string): boolean {
    return segmentText(value).some((s) => s.kind === 'math');
}
