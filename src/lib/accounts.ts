/**
 * ACCOUNT TYPES
 * ----------------------------------------------------------------------------
 * Who somebody is. Not what they may do.
 *
 * THE DISTINCTION, ONCE, PROPERLY
 *
 * `profiles.role` — owner, admin, user — is the permission role. Every row
 * level security policy turns on it and `requireAdmin`/`requireOwner` gate the
 * API with it. It is granted by an owner, never chosen.
 *
 * `profiles.account_type` — student, teacher, parent, institution — is this.
 * It is picked freely at signup, changed whenever somebody likes, and grants
 * absolutely nothing.
 *
 * Merging them was the obvious-looking move and it is a privilege escalation
 * wearing a friendly label: the moment a signup dropdown writes to the column
 * that decides ability, choosing "teacher" from a list becomes a way to award
 * yourself whatever a teacher may do. So this file decides which navigation
 * somebody sees and which resources are suggested, and nothing beyond that. A
 * database trigger enforces the same rule from the other side — see migration
 * 024 — because a rule that lives only in the client is a rule until somebody
 * opens the network tab.
 */

import type { LevelSlug } from './catalog';
import type { ResourceFamily } from './resources';

export type AccountType = 'student' | 'teacher' | 'parent' | 'institution';

export interface AccountTypeDef {
    slug: AccountType;
    /** First person, because it is chosen by answering "which are you?". */
    label: string;
    /** The one line under the label on the picker. */
    blurb: string;
    /**
     * Which resource families lead for this account type.
     *
     * Not a filter — everything stays reachable. This only decides what is put
     * first, because a teacher scrolling past eight kinds of revision paper to
     * reach schemes of work is the thing that makes a shared library feel like
     * somebody else's.
     */
    leadFamilies: ResourceFamily[];
    /** Where signing in takes them. */
    home: string;
}

export const ACCOUNT_TYPES: AccountTypeDef[] = [
    {
        slug: 'student',
        label: 'I am a learner',
        blurb: 'Past papers, revision notes and topical questions for my class',
        leadFamilies: ['Sit & revise', 'Study & understand'],
        home: '/home',
    },
    {
        slug: 'teacher',
        label: 'I teach',
        blurb: 'Schemes of work, lesson plans and exams for the classes I take',
        leadFamilies: ['Teach & plan', 'Sit & revise'],
        home: '/home',
    },
    {
        slug: 'parent',
        label: 'I am a parent or guardian',
        blurb: "Follow my child's progress and find work that helps them",
        leadFamilies: ['Sit & revise', 'Study & understand'],
        home: '/home',
    },
    {
        slug: 'institution',
        label: 'I run a school',
        blurb: 'Stock a staffroom: resources for every class we teach',
        leadFamilies: ['Teach & plan', 'Reference'],
        home: '/home',
    },
];

export const ACCOUNT_TYPE_BY_SLUG: Record<string, AccountTypeDef> = Object.fromEntries(
    ACCOUNT_TYPES.map((a) => [a.slug, a])
);

export function accountTypeName(slug?: string | null): string {
    if (!slug) return 'Account';
    return ACCOUNT_TYPE_BY_SLUG[slug]?.label ?? slug;
}

/** True for the account types that look at their own results. */
export function sitsPapers(type?: AccountType | null): boolean {
    return type === 'student';
}

/** True for the account types that plan lessons. */
export function teaches(type?: AccountType | null): boolean {
    return type === 'teacher' || type === 'institution';
}

/**
 * The profile fields this product personalises from.
 *
 * Deliberately small. Every extra question at signup is another reason to
 * abandon it, and level plus a handful of subjects already carries almost all
 * of the value — it is enough to open the right shelf and recommend the right
 * papers, which is the whole job.
 */
export interface AccountProfile {
    accountType: AccountType | null;
    level: LevelSlug | null;
    grade: string | null;
    subjects: string[];
    school: string | null;
    /** Null when they have never been asked, which is not the same as declining. */
    onboardedAt: string | null;
}

export const EMPTY_ACCOUNT_PROFILE: AccountProfile = {
    accountType: null,
    level: null,
    grade: null,
    subjects: [],
    school: null,
    onboardedAt: null,
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export function toAccountProfile(row: any): AccountProfile {
    if (!row) return EMPTY_ACCOUNT_PROFILE;
    return {
        accountType: (row.account_type as AccountType) ?? null,
        level: (row.level_slug as LevelSlug) ?? null,
        grade: row.grade_label ?? null,
        subjects: Array.isArray(row.subject_interests) ? row.subject_interests : [],
        school: row.school_name ?? null,
        onboardedAt: row.onboarded_at ?? null,
    };
}
