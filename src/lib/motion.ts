/**
 * THE SPRING VOCABULARY.
 *
 * Seven springs cover the entire product, and there is no eighth. When a new
 * component appears it borrows from this table rather than inventing a curve,
 * and that inheritance is the whole reason a menu, a modal and a drawer built
 * months apart feel like they were made by one hand.
 *
 * Ported from the oa-design skill (`.claude/skills/oa-design/_motion.md`).
 *
 * These are for the screens that already pay for framer-motion — the exam room
 * and the admin tools. The global chrome cannot: `/` is deliberately HTML and
 * nothing else on a Kenyan mobile connection, so the navigation, the drawers
 * and the dialogs move on the CSS ports of these same springs, sampled as
 * `linear()` easings in `globals.css` under `--spring-*`. Same curves, one
 * vocabulary, paid for twice over only where the budget already allows it.
 *
 * If you reach for a number that is not here, the answer is one of these seven.
 */

export interface Spring {
    readonly type: 'spring';
    readonly stiffness: number;
    readonly damping: number;
}

const spring = (stiffness: number, damping: number): Spring =>
    ({ type: 'spring', stiffness, damping }) as const;

/** Anything that opens in place: dropdowns, menus, sheets, toggles. */
export const PANEL = spring(550, 38);

/** Measured height and width, travelling pills, marker moves. */
export const LAYOUT = spring(550, 40);

/** Modal and dialog entrance. */
export const POP = spring(400, 26);

/** Modal exit — a touch softer than POP, because leaving should get out of
 *  the way rather than announce itself. */
export const POP_EXIT = spring(380, 28);

/** Floating pills and page-level banners. */
export const BANNER = spring(400, 30);

/** Icon micro-moves: a chevron turning, a glyph swapping. */
export const FLICK = spring(900, 50);

/** Chart tooltips and crosshair followers. */
export const CHART = spring(300, 28);

/**
 * Micro fades that accompany the springs. Exits are always faster than
 * entrances; nothing in the app chrome tweens past 0.2s. If a move feels slow,
 * lower the damping before you reach for a longer duration.
 */
export const FADE_IN = { duration: 0.16, ease: 'easeOut' } as const;
export const FADE_OUT = { duration: 0.1, ease: 'easeOut' } as const;

/**
 * The durations the CSS ports settle in, in milliseconds, for the rare case
 * where JS has to wait out an animation it did not start (see `Presence`).
 * Each is the point where that spring's envelope has decayed below half a
 * percent — past there the movement is not visible.
 */
export const SETTLE_MS = {
    panel: 279,
    layout: 265,
    pop: 408,
    popExit: 379,
    banner: 353,
    flick: 212,
    chart: 379,
} as const;
