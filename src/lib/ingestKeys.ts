import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * INGEST KEYS — how a program proves it is allowed to write into the bank.
 *
 * The MCP server runs on somebody's laptop, not in this deployment, so it can
 * hold neither a browser session nor the service-role key. The service-role key
 * bypasses row level security entirely, which would make a leaked laptop
 * equivalent to a leaked database.
 *
 * A key here can do exactly one thing: submit questions for review. It cannot
 * read a buyer's library, cannot publish, cannot touch orders. That is the whole
 * point of it being a different credential rather than a borrowed one.
 */

const PREFIX = 'skb_ingest_';

/** How much of the key is stored in clear, so a key is recognisable in a list. */
const VISIBLE = PREFIX.length + 6;

export interface MintedKey {
    /** Shown once, at creation, and never again. */
    key: string;
    hash: string;
    prefix: string;
}

/**
 * A new key.
 *
 * 32 bytes of CSPRNG, which is well past guessing. Only the hash is ever
 * written down — a credential that cannot be read back out of the database
 * cannot be leaked by anything that can read the database, including a backup,
 * a support query, or a future bug in an admin screen.
 */
export function mintKey(): MintedKey {
    const key = PREFIX + randomBytes(32).toString('base64url');
    return { key, hash: hashKey(key), prefix: key.slice(0, VISIBLE) };
}

export function hashKey(key: string): string {
    return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** Shape check before touching the database, so junk never costs a query. */
export function looksLikeKey(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.startsWith(PREFIX) && value.length > VISIBLE + 20;
}

export interface KeyOwner {
    keyId: string;
    userId: string;
    name: string;
}

/**
 * Who this key belongs to, or null.
 *
 * Compared by hash in constant time. A plain `===` on a secret leaks its
 * prefix through timing, and while that is a thin channel over the internet it
 * costs one function call to close.
 */
export async function resolveKey(
    admin: SupabaseClient,
    presented: string
): Promise<KeyOwner | null> {
    if (!looksLikeKey(presented)) return null;

    const hash = hashKey(presented);

    const { data, error } = await admin
        .from('ingest_keys')
        .select('id, name, key_hash, created_by, revoked_at')
        .eq('key_hash', hash)
        .is('revoked_at', null)
        .maybeSingle();

    if (error || !data) return null;

    const a = Buffer.from(hash, 'utf8');
    const b = Buffer.from(String(data.key_hash), 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    // Best effort: a key that works but cannot record that it worked is still a
    // key that works, and failing the request over a bookkeeping write would be
    // the wrong trade.
    void admin
        .from('ingest_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', data.id)
        .then(undefined, () => undefined);

    return { keyId: String(data.id), userId: String(data.created_by), name: String(data.name) };
}

/** The key presented on a request, from either header form. */
export function presentedKey(headers: Headers): string | null {
    const bearer = headers.get('authorization');
    if (bearer?.toLowerCase().startsWith('bearer ')) return bearer.slice(7).trim();
    return headers.get('x-ingest-key');
}
