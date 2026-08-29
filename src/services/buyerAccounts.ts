/**
 * THE ACCOUNT BEHIND A PHONE NUMBER
 * ----------------------------------------------------------------------------
 * One answer to "whose papers are these?", shared by the WhatsApp bot and the
 * shop's guest checkout.
 *
 * It has to be shared. A teacher who buys on WhatsApp on Monday and on the
 * website on Tuesday, from the same number, is one customer with one library —
 * and two independent lookups is exactly how they become two accounts, each
 * holding half of what they paid for, with nothing obviously broken in either.
 *
 * Creating the account silently is the point: the buyer never fills in a signup
 * form, but their purchases accumulate somewhere real, so the day they do sign
 * in properly everything is already waiting.
 *
 * IMPORTANT — this resolves an identity, it does not authenticate one. A phone
 * number is proof on WhatsApp, where the message arrived from it, and proof of
 * nothing in a web form, where anyone can type anyone's. Callers on the web
 * must not turn what this returns into a session; see lib/orderAccess.ts for
 * what they get instead.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The account for a phone number, created on first sight.
 *
 * Returns null rather than throwing when the account cannot be made: a failure
 * here should cost a checkout its guest account, not the sale.
 */
export async function findOrCreateBuyerForPhone(
    admin: any,
    phone: string,
    source: 'whatsapp' | 'checkout'
): Promise<string | null> {
    if (!phone) return null;

    const { data: existing, error: lookupError } = await admin
        .from('profiles')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();

    if (lookupError) {
        console.error('Buyer lookup by phone failed:', lookupError.message);
        return null;
    }
    if (existing?.id) return existing.id;

    const { data: created, error } = await admin.auth.admin.createUser({
        phone,
        phone_confirm: true,
        user_metadata: { source },
    });

    if (error || !created?.user) {
        console.error(`Could not create an account for a ${source} number:`, error?.message);
        return null;
    }

    /*
     * The signup trigger writes the profile from the auth row, phone included
     * since migration 020 — but only if the trigger fired and only if it saw
     * the phone. This is the belt to that braces: without a profile row
     * carrying the number, the lookup above misses on the buyer's next visit
     * and they get a second account, forever.
     */
    const { error: profileError } = await admin
        .from('profiles')
        .update({ phone })
        .eq('id', created.user.id)
        .is('phone', null);

    if (profileError) {
        console.error('Could not record the phone on a new profile:', profileError.message);
    }

    return created.user.id;
}
