import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { requireUser } from '@/utils/auth/guards';

/**
 * LINKING A WHATSAPP NUMBER TO A WEBSITE ACCOUNT
 * ----------------------------------------------------------------------------
 * GET  /api/account/link-code   is a number already linked?
 * POST /api/account/link-code   mint a code to type into the chat
 *
 * WHY A CODE AND NOT AN EMAIL
 *
 * The obvious design is "tell the bot your email and we will join the
 * accounts". That is an account takeover with two words of typing: knowing
 * somebody's address proves nothing about owning it, and the reward for
 * guessing is every paper they have ever bought.
 *
 * A code shown only to a signed-in browser and typed into a specific handset
 * proves control of both ends, which is exactly the claim being made. It needs
 * no email round trip, which matters when half the customers signed up with a
 * phone number in the first place.
 *
 * WHY IT IS SHORT-LIVED AND SINGLE-USE
 *
 * Fifteen minutes and one redemption. A code that lives for hours is a code
 * that gets screenshot, forwarded, or read over a shoulder — and redeeming it
 * moves purchases onto the redeemer's account. Minting a new one retires the
 * previous, so there is never more than one live code per account to lose.
 */

/**
 * No I, O, 0 or 1.
 *
 * The code is read off a screen and typed into a phone keyboard by somebody who
 * is mid-purchase. Every ambiguous pair costs a failed attempt, and a failed
 * attempt on a 15-minute code is a support message.
 *
 * Thirty-two characters and six places is about 1.07 billion codes, of which at
 * most a handful are live at any moment.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const TTL_MS = 15 * 60 * 1000;

/** Ten an hour. Generous for a human, useless for grinding out collisions. */
const MAX_PER_HOUR = 10;

/**
 * `Math.random` is not a source of secrets and this string is one — it is the
 * only thing standing between a stranger and somebody's purchases. The alphabet
 * is 32 long, so masking to five bits is exactly uniform with no modulo bias.
 */
function generateCode(): string {
    const bytes = randomBytes(CODE_LENGTH);
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[bytes[i] & 31];
    return code;
}

/** `+254712345678` → `+254 712 ••• 678`. Enough to recognise, not to dictate. */
function maskPhone(phone: string): string {
    const trimmed = phone.replace(/\s+/g, '');
    if (trimmed.length < 7) return '•••';
    return `${trimmed.slice(0, 7)} ••• ${trimmed.slice(-3)}`;
}

export async function GET() {
    const supabase = await createClient();
    const { actor, failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    const admin = createAdminClient();
    if (!admin) {
        // Without the service role there is no way to read the sessions table,
        // which no end user may query. Reporting "not linked" would be a guess.
        return NextResponse.json({ error: 'Account linking is not configured' }, { status: 503 });
    }

    const { data: session, error } = await admin
        .from('whatsapp_sessions')
        .select('phone, updated_at')
        .eq('user_id', actor.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('GET /api/account/link-code failed:', error.message);
        return NextResponse.json({ error: 'Could not check your WhatsApp link' }, { status: 500 });
    }

    return NextResponse.json({
        linked: Boolean(session?.phone),
        phone: session?.phone ? maskPhone(session.phone) : null,
    });
}

export async function POST() {
    const supabase = await createClient();
    const { actor, failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    const admin = createAdminClient();
    if (!admin) {
        return NextResponse.json({ error: 'Account linking is not configured' }, { status: 503 });
    }

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
        .from('account_link_codes')
        .select('code', { count: 'exact', head: true })
        .eq('user_id', actor.id)
        .gte('created_at', hourAgo);

    if ((count ?? 0) >= MAX_PER_HOUR) {
        return NextResponse.json(
            { error: 'That is a lot of codes. Try again in an hour, or ask us for help.' },
            { status: 429 }
        );
    }

    // Retire anything still live for this account. One code at a time means one
    // code to lose track of, and a screenshot from twenty minutes ago cannot be
    // redeemed by whoever it was forwarded to.
    const nowIso = new Date().toISOString();
    await admin
        .from('account_link_codes')
        .update({ expires_at: nowIso })
        .eq('user_id', actor.id)
        .is('used_at', null)
        .gt('expires_at', nowIso);

    const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

    // The primary key does the collision check, so a clash is a failed insert
    // rather than a read-then-write race that two requests could both win.
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode();

        const { error } = await admin
            .from('account_link_codes')
            .insert({ code, user_id: actor.id, expires_at: expiresAt });

        if (!error) {
            return NextResponse.json({ code, expiresAt, expiresInMinutes: TTL_MS / 60000 });
        }

        // 23505 is a unique violation — try another code. Anything else is real.
        if (error.code !== '23505') {
            console.error('POST /api/account/link-code failed:', error.message);
            return NextResponse.json({ error: 'Could not create a code' }, { status: 500 });
        }
    }

    console.error('Could not find a free link code after five attempts.');
    return NextResponse.json({ error: 'Could not create a code. Try again.' }, { status: 500 });
}
