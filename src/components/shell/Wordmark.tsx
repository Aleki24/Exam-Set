import React from 'react';

interface WordmarkProps {
    /** Adds the product suffix, e.g. "Skulbase Exams". */
    suffix?: string;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * The Skulbase wordmark, in the same two-tone treatment as the school
 * management app: "skul" in brand blue, "base" in brand green.
 *
 * Kept identical on purpose — it is the single strongest signal that the exam
 * shop and Skulbase are the same product family.
 */
export function Wordmark({ suffix, className, style }: WordmarkProps) {
    return (
        <span className={className} style={style}>
            <span style={{ color: 'var(--primary)' }}>Skul</span>
            <span style={{ color: 'var(--brand-green)' }}>base</span>
            {suffix && <span className="text-foreground">&nbsp;{suffix}</span>}
        </span>
    );
}

/**
 * The square mark used where the full wordmark will not fit — the mobile nav,
 * favicons, avatars. Two-tone split down the middle, echoing the wordmark.
 */
export function BrandMark({ className = '' }: { className?: string }) {
    return (
        <span
            className={`relative grid place-items-center overflow-hidden rounded-md font-display font-extrabold ${className}`}
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            aria-hidden
        >
            <span
                className="absolute inset-y-0 right-0 w-1/2"
                style={{ background: 'var(--brand-green)' }}
            />
            <span className="relative z-10">S</span>
        </span>
    );
}
