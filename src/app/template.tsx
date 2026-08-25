/**
 * The page transition.
 *
 * This used to be a framer-motion `motion.div` opening at
 * `initial={{ opacity: 0, scale: 0.98 }}`, which meant every page in the
 * product was server-rendered carrying `style="opacity:0"` and stayed
 * invisible until the animation runtime had downloaded, hydrated and run.
 * Nothing was broken on a fast laptop — and on a slow Kenyan mobile
 * connection the entire site was a blank white screen for as long as that
 * took, with no text, no layout and nothing to read. If the JavaScript never
 * arrived at all, neither did the page.
 *
 * That is the exact promise `/` makes about itself: HTML and nothing else,
 * complete the moment it arrives. It could not keep it while this file
 * existed in that form.
 *
 * The same fade, done in CSS, costs no library and blocks no paint: the
 * browser renders the page and runs the animation itself, at first paint,
 * on the frame the HTML lands. `fade-in` is the site's own utility and
 * already collapses under `prefers-reduced-motion`.
 *
 * No `'use client'` either, so a server component stays a server component
 * and framer-motion leaves the shared bundle that every route pays for.
 */
export default function Template({ children }: { children: React.ReactNode }) {
    return <div className="fade-in">{children}</div>;
}
