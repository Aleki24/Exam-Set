/**
 * SUBSCRIPTION PLANS
 * ----------------------------------------------------------------------------
 * Shapes and presentation helpers for the all-access pass.
 *
 * The plans themselves live in the `subscription_plans` table rather than in
 * this file, because price is the thing most likely to move after launch and it
 * should not need a deploy. Everything here is about how a plan is described,
 * not what it costs.
 */

import { formatPrice } from './catalog';

export interface SubscriptionPlan {
    slug: string;
    name: string;
    description: string | null;
    price_cents: number;
    currency: string;
    duration_days: number;
    sort_order: number;
    is_featured: boolean;
}

export interface SubscriptionStatus {
    active: boolean;
    plan_slug?: string;
    plan_name?: string;
    expires_at?: string;
    /** Whole days left, rounded up. 0 once it has lapsed. */
    days_left?: number;
}

/** Days remaining on a subscription, counting a part-day as a day. */
export function daysLeft(expiresAt: string | Date): number {
    const end = new Date(expiresAt).getTime();
    const remaining = end - Date.now();
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / 86_400_000);
}

/**
 * "KES 999 for a year" — the phrase people compare plans with.
 * Durations are named rather than counted in days: "30 days" reads like a
 * limitation, "a month" reads like a plan.
 */
export function durationLabel(days: number): string {
    if (days >= 360) return 'a year';
    if (days >= 300) return `${Math.round(days / 30)} months`;
    if (days >= 100) return 'a term';
    if (days >= 28 && days <= 31) return 'a month';
    if (days % 30 === 0) return `${days / 30} months`;
    return `${days} days`;
}

/**
 * What the plan costs per month, which is the only way three plans of different
 * lengths can be compared honestly. Returned as text because the comparison is
 * for reading, not for arithmetic.
 */
export function perMonth(plan: SubscriptionPlan): string {
    const months = plan.duration_days / 30;
    if (months < 1.5) return '';
    return `${formatPrice(Math.round(plan.price_cents / months), plan.currency)} a month`;
}

/**
 * How much cheaper this plan is per month than the shortest one, as a whole
 * percentage. Returns 0 when there is nothing to boast about, so the caller can
 * simply omit the badge.
 */
export function savingsPercent(plan: SubscriptionPlan, all: SubscriptionPlan[]): number {
    const shortest = [...all].sort((a, b) => a.duration_days - b.duration_days)[0];
    if (!shortest || shortest.slug === plan.slug) return 0;

    const baseline = shortest.price_cents / shortest.duration_days;
    const mine = plan.price_cents / plan.duration_days;
    if (baseline <= 0 || mine >= baseline) return 0;

    return Math.round((1 - mine / baseline) * 100);
}
