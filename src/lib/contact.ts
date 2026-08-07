/**
 * How to reach us.
 *
 * Read from the environment rather than hardcoded, and every field is allowed
 * to be missing. The contact page renders only what is set: an invented support
 * address is worse than no address at all, because somebody writes to it and
 * concludes they were ignored.
 *
 * These are `NEXT_PUBLIC_*` because the contact page is a public, statically
 * rendered surface. Nothing here is a secret — a support email and a WhatsApp
 * number exist to be published.
 */
export interface ContactChannels {
    email?: string;
    /** Digits only, international format, e.g. 254712345678 — for wa.me links. */
    whatsapp?: string;
    /** The M-Pesa paybill, shown so a stalled payment can be completed by hand. */
    paybill?: string;
    /** The M-Pesa till, for accounts that collect through one instead. */
    till?: string;
}

function clean(value?: string): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

export function contactChannels(): ContactChannels {
    return {
        email: clean(process.env.NEXT_PUBLIC_SUPPORT_EMAIL),
        whatsapp: clean(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP)?.replace(/[^0-9]/g, '') || undefined,
        paybill: clean(process.env.NEXT_PUBLIC_MPESA_PAYBILL),
        till: clean(process.env.NEXT_PUBLIC_MPESA_TILL),
    };
}

/** True when there is at least one way to get in touch. */
export function hasAnyChannel(channels: ContactChannels): boolean {
    return Boolean(channels.email || channels.whatsapp);
}
