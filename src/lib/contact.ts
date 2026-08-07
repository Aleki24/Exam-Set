/**
 * How to reach us.
 *
 * The published defaults live here because that is what they are: values meant
 * to be on a public page, stable across every deployment, and useless as
 * secrets. Environment variables still win, so a fork or a staging deployment
 * can point support somewhere else without editing code.
 *
 * Every field is allowed to be missing, and the contact page renders only what
 * it is given. An invented support address is worse than none at all — somebody
 * writes to it, hears nothing back, and concludes they were ignored.
 */

/** The number Safaricom knows, in the form `wa.me` wants: no +, no spaces. */
const WHATSAPP = '254740129444';
const EMAIL = 'alexotieno293@gmail.com';
export interface ContactChannels {
    email?: string;
    /** Digits only, international format, e.g. 254712345678 — for wa.me links. */
    whatsapp?: string;
    /** The same number written the way a Kenyan reads it back. */
    whatsappDisplay?: string;
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
    const whatsapp = normaliseKenyanNumber(clean(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP) ?? WHATSAPP);

    return {
        email: clean(process.env.NEXT_PUBLIC_SUPPORT_EMAIL) ?? EMAIL,
        whatsapp,
        whatsappDisplay: whatsapp ? formatKenyanNumber(whatsapp) : undefined,
        paybill: clean(process.env.NEXT_PUBLIC_MPESA_PAYBILL),
        till: clean(process.env.NEXT_PUBLIC_MPESA_TILL),
    };
}

/**
 * Any way a Kenyan number gets written, in the one form `wa.me` accepts.
 *
 * `0740129444`, `+254 740 129 444` and `254740129444` are the same phone, and
 * a link built from the first of them silently opens a chat with nobody.
 */
export function normaliseKenyanNumber(raw?: string): string | undefined {
    const digits = raw?.replace(/[^0-9]/g, '');
    if (!digits) return undefined;

    // 0740129444 → 254740129444
    if (digits.startsWith('0')) return `254${digits.slice(1)}`;
    // 740129444 → 254740129444
    if (digits.length === 9) return `254${digits}`;
    return digits;
}

/** 254740129444 → 0740 129 444. */
function formatKenyanNumber(international: string): string {
    if (!international.startsWith('254') || international.length !== 12) return international;
    const local = `0${international.slice(3)}`;
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/** True when there is at least one way to get in touch. */
export function hasAnyChannel(channels: ContactChannels): boolean {
    return Boolean(channels.email || channels.whatsapp);
}
