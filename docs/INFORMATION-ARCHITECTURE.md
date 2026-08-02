# Information architecture

How the platform is organised, why, and what is built versus planned.

The shop already sells exam papers. This document covers turning that into the
full resource library a Kenyan school actually needs — notes, schemes of work,
lesson plans, set-book guides, curriculum designs — without a second product
bolted onto the side of the first.

---

## 1. The one structural decision

Everything here follows from a single choice: **a resource is an exam row with a
kind**, not a new entity.

The alternative — a `resources` table beside `exams` — was rejected. Every piece
of commerce machinery in this codebase keys on `exam_id`: `entitlements`,
`orders`, `cart`, `can_download_paper`, `increment_paper_download`, the M-Pesa
callback, the signed-download route, and the row level security in migration
012. A second table means a second copy of all of it, and the copy drifts. The
first time it drifts, someone downloads a paper they did not buy.

So `exams` gains one column, `resource_kind`, defaulting to `past-paper`. Every
existing row keeps working, every download stays gated by the same SQL, and a
scheme of work is sold, owned and delivered by the exact code path that already
sells a mock. The trade is that `exams` is now a slightly inaccurate table name
for what it holds. That is a cheap price for one paywall instead of two.

A resource that carries `question_ids` can be sat as an exam and rendered by
`paperPdf`. A resource that carries only a `pdf_storage_key` is a document. Both
are rows in the same table, and the kind says which is which.

---

## 2. Taxonomy

Three axes. A resource is located by all three, and every browse surface is a
projection of them.

```
LEVEL  ───────────────►  SUBJECT  ───────────────►  KIND
Playgroup                Mathematics               Past paper
Pre-Primary              English                   Marking scheme
Lower Primary            Kiswahili                 Termly exam
Upper Primary            Integrated Science        County mock
Junior School            Social Studies            Prediction set
Senior School            Agriculture & Nutrition   Topical questions
Form 1–4 (8-4-4)         Pre-Technical Studies     Revision notes
                         …                         Scheme of work
                                                   Lesson plan
                                                   Record of work
                                                   Holiday assignment
                                                   Set-book guide
                                                   Syllabus
                                                   Curriculum design
                                                   Assessment tools
                                                   Revision booklet
```

**Level** already exists in `lib/catalog.ts` and needed one addition: Playgroup /
Baby Class, which the old model mentioned in prose but never modelled, so it
could not be filtered or browsed.

**Kind** is new — `lib/resources.ts`. It is deliberately separate from
`exam_type`. They answer different questions and conflating them was the trap:
`exam_type` says *which sitting* a paper belongs to (opener, mid-term, county
mock), `resource_kind` says *what the artefact is* (a paper, a scheme of work, a
set-book guide). A Grade 9 end-term exam is `kind=termly-exam` +
`exam_type=end-term`. A Grade 9 scheme of work has a kind and no exam type at
all, which is exactly why one field could never carry both.

Kinds are grouped into four families, and the grouping is what the UI renders:

| Family | Kinds | Who it is for |
|---|---|---|
| **Sit & revise** | past paper, marking scheme, termly exam, mock, prediction, topical, revision booklet, holiday assignment | Learners |
| **Study & understand** | revision notes, set-book guide | Learners |
| **Teach & plan** | scheme of work, lesson plan, record of work, curriculum design, assessment tools | Teachers |
| **Reference** | syllabus | Everyone |

The families are why a learner and a teacher can share one library without
either wading through the other's material.

---

## 3. Routes

```
/                              Shop — flat, filtered, search-first (exists)
/set                           Exam setter (exists)
/cart  /plans  /library        Commerce and account (exists)
/auth/*                        Sign in, sign up, recovery (exists)

/learn                         Library hub — every level, every family
/learn/[level]                 One level: subjects, kinds, what is new
/learn/[level]/[subject]       One subject: resources grouped by kind
/papers/[id]                   Resource detail + download (exists, extended)
```

`/` and `/learn` are deliberately different doors to the same stock, because two
different people arrive.

Someone who knows what they want types it — that is `/`, which is search and
filters over everything, and it already works well. Someone who does *not* know
what they want browses down a hierarchy — that is `/learn`, which never asks a
question the visitor cannot answer. A parent knows their child is in Grade 4.
They do not know what a "summative assessment" is, and a filter rail that opens
with twenty-six exam types is a wall. The hierarchy asks level, then subject,
then shows what exists.

Both read the same `/api/papers`. There is one catalogue, two ways in.

---

## 4. Page flows

### Discovery → download

```
/learn
  └─ pick level ──────────► /learn/junior-school
       └─ pick subject ───► /learn/junior-school/mathematics
            └─ pick one ──► /papers/grade-9-maths-end-term-2026
                 ├─ free ──────────► download immediately (sign-in required)
                 ├─ owned ─────────► download immediately
                 └─ paid ──────────► add to cart ──► /cart ──► M-Pesa ──► library
```

The paywall is one gate, in one place: `/api/papers/[id]/download` asks
`can_download_paper` and mints a fifteen-minute signed URL. Nothing else in the
product releases a file. Every route above ends at that same door.

### Membership

```
/auth/signup ──► confirm email ──► /auth/callback ──► /learn
/auth/login  ──► ?next= honoured ──► wherever they were going
/auth/forgot-password ──► email ──► /auth/callback?type=recovery ──► /auth/reset-password
/plans ──► choose pass ──► M-Pesa ──► entitlement covers the whole catalogue
```

All of this exists and is unchanged. The one addition is that `/learn` is a
sensible post-signup destination in a way the flat shop never was.

### Role-aware surfaces (planned — see §6)

```
Student      /learn defaults to their grade · progress · attempted papers
Teacher      /learn defaults to what they teach · bulk packs · class links
Parent       simplified progress for a linked child · recommended study plan
Institution  seats, shared library, school-wide downloads
```

---

## 5. What is built

| Piece | State |
|---|---|
| `lib/resources.ts` — kind taxonomy, families, level applicability | **Built** |
| Playgroup / Baby Class level | **Built** |
| Subject taxonomy per level, CBE-accurate | **Built** |
| `023_resource_kinds.sql` — column, index, backfill | **Built** |
| `/learn` hub | **Built** |
| `/learn/[level]` | **Built** |
| `/learn/[level]/[subject]` | **Built** |
| `resource_kind` filter through `/api/papers` | **Built** |
| Existing commerce, download gating, auth | **Already existed, untouched** |

## 6. What is not built

Listed plainly, because a plan that hides its own gaps is worse than no plan.

| Piece | Why not, and what it needs |
|---|---|
| **Progress tracking** | Needs an `attempts` table and a results pipeline. `exam_sessions` already records sittings, so the data exists; the aggregation, the trend maths and the UI do not. |
| **Role-aware navigation** | Needs `profiles.role` widened past owner/admin/user to include student/teacher/parent/institution, a role picker at signup, and a per-role default view. Widening the role enum touches every RLS policy in migration 012 — it is not a UI change and must not be done as one. |
| **Parent view** | Needs a guardian↔learner link table and a consent model. Showing one person another person's results is the single most sensitive thing this product could do, and it needs designing before it needs building. |
| **Teacher tools** | Bulk packs need a zip-on-demand route; class share links need a token model with expiry; assignment tracking is its own subsystem. |
| **Personalisation** | "Continue where you left off" needs recently-viewed persistence; recommendations need a signal to recommend from. Both are cheap *after* progress tracking exists and near-meaningless before. |
| **Offline / download queue** | Needs a service worker and a cache strategy. Genuinely valuable on Kenyan mobile data and genuinely out of scope for a first pass. |
| **Exam countdown** | Needs a national exam calendar as data. Trivial to build, but wrong to fake — a countdown to a date nobody verified is worse than no countdown. |

Trust signals — "Updated for 2026", last-updated dates, educator-verified badges
— are partially built: the date is real and rendered, the verification badge is
not, because nothing yet performs the verification it would claim.

---

## 7. Design language

Unchanged, and deliberately so. Every surface added here uses the tokens already
in `globals.css`: `sheet` for cards with the ruled red margin that inks in on
hover, `overline` for the mono kickers, `title-1`/`title-2` in Syne, `figure` for
anything numeric, `chip` for filters, `rail-x` for horizontal scrollers on
mobile. Blue is action, amber is money, red is marks, green is free. No new
colour, no new radius, no new shadow, no new font.

The one pattern added is the **kind tile** on `/learn` — and it is `sheet` with a
different arrangement of the same parts, not a new component idea.
