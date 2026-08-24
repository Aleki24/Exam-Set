'use client';

import { useEffect, useState } from 'react';

/**
 * Keep a thing mounted long enough to leave.
 *
 * The rule from the oa-design skill is that nothing blinks out, it exits — but
 * React unmounts on the frame the state flips, so an exit animation on a
 * conditionally rendered element never gets to run. framer-motion solves this
 * with AnimatePresence, and the exam room already pays for that library. The
 * chrome does not: the navigation and the catalogue sit on every page,
 * including the front door whose entire argument is that it is HTML and nothing
 * else on a Kenyan mobile connection.
 *
 * So: fourteen lines instead of fifty kilobytes. Pass the open flag and how
 * long the exit takes; render while `mounted`, and pick the entrance or exit
 * class off `open` itself.
 *
 *   const mounted = usePresence(open, 180);
 *   if (!mounted) return null;
 *   return <div className={open ? 'drawer-in' : 'drawer-out'}>…</div>;
 *
 * Anyone who has asked their OS to calm things down skips the wait entirely,
 * which matches what the reduced-motion block in `globals.css` does to the
 * animation itself.
 */
export function usePresence(open: boolean, exitMs: number): boolean {
    const [mounted, setMounted] = useState(open);

    useEffect(() => {
        if (open) {
            setMounted(true);
            return;
        }

        if (
            typeof window !== 'undefined' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
            setMounted(false);
            return;
        }

        const timer = window.setTimeout(() => setMounted(false), exitMs);
        return () => window.clearTimeout(timer);
    }, [open, exitMs]);

    return mounted;
}
