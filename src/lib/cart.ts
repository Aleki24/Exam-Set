'use client';

/**
 * CART
 * ----------------------------------------------------------------------------
 * A cart of papers, kept in localStorage so it survives a refresh and a
 * sign-in redirect. Prices held here are for display only — the server reprices
 * everything at checkout.
 */

import { useCallback, useEffect, useState } from 'react';
import type { CartItem, PaperListing } from '@/types/shop';
import { bundleDiscount, sumCents } from '@/lib/catalog';

const STORAGE_KEY = 'skulbase.cart.v1';
const CHANGED_EVENT = 'skulbase:cart-changed';

function read(): CartItem[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((i) => i && typeof i.exam_id === 'string') : [];
    } catch {
        return [];
    }
}

function write(items: CartItem[]) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    // Same-tab listeners; `storage` only fires in *other* tabs.
    window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function toCartItem(paper: PaperListing): CartItem {
    return {
        exam_id: paper.id,
        title: paper.title,
        subject: paper.subject,
        grade_label: paper.grade_label,
        exam_type: paper.exam_type,
        year: paper.year,
        price_cents: paper.price_cents,
        currency: paper.currency,
        has_marking_scheme: paper.has_marking_scheme,
    };
}

export interface CartTotals {
    subtotalCents: number;
    discountCents: number;
    discountPercent: number;
    totalCents: number;
    currency: string;
}

export function cartTotals(items: CartItem[]): CartTotals {
    const subtotalCents = sumCents(items);
    const paidCount = items.filter((i) => i.price_cents > 0).length;
    const { percentOff, amountCents } = bundleDiscount(paidCount, subtotalCents);
    return {
        subtotalCents,
        discountCents: amountCents,
        discountPercent: percentOff,
        totalCents: Math.max(0, subtotalCents - amountCents),
        currency: items[0]?.currency || 'KES',
    };
}

/**
 * Cart state, shared across every component that calls it. Each hook instance
 * re-reads storage on the change event, so the header count and the shop
 * buttons never disagree.
 */
export function useCart() {
    const [items, setItems] = useState<CartItem[]>([]);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        setItems(read());
        setReady(true);

        const sync = () => setItems(read());
        window.addEventListener(CHANGED_EVENT, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener(CHANGED_EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

    const add = useCallback((paper: PaperListing | CartItem) => {
        const item: CartItem = 'exam_id' in paper ? paper : toCartItem(paper);
        const current = read();
        if (current.some((i) => i.exam_id === item.exam_id)) return false;
        write([...current, item]);
        return true;
    }, []);

    /**
     * Add a whole sitting at once.
     *
     * One write rather than one per paper: twelve sequential `add` calls are
     * twelve storage writes and twelve change events, and the last one wins on
     * a slow phone — which is how "add all 12" quietly adds one.
     *
     * Papers already in the cart, and papers the caller already owns, are
     * skipped rather than duplicated. Returns how many were actually added, so
     * the caller can say "added 9" when three were already there instead of
     * claiming twelve.
     */
    const addAll = useCallback((papers: PaperListing[]) => {
        const current = read();
        const present = new Set(current.map((i) => i.exam_id));
        const fresh = papers
            .filter((p) => !p.owned && !present.has(p.id))
            .map(toCartItem);
        if (fresh.length === 0) return 0;
        write([...current, ...fresh]);
        return fresh.length;
    }, []);

    const remove = useCallback((examId: string) => {
        write(read().filter((i) => i.exam_id !== examId));
    }, []);

    const toggle = useCallback((paper: PaperListing) => {
        const current = read();
        if (current.some((i) => i.exam_id === paper.id)) {
            write(current.filter((i) => i.exam_id !== paper.id));
            return false;
        }
        write([...current, toCartItem(paper)]);
        return true;
    }, []);

    const clear = useCallback(() => write([]), []);

    const has = useCallback((examId: string) => items.some((i) => i.exam_id === examId), [items]);

    return {
        items,
        ready,
        count: items.length,
        totals: cartTotals(items),
        add,
        addAll,
        remove,
        toggle,
        clear,
        has,
    };
}
