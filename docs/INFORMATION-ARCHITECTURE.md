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

/home                          Arranged around whoever is signed in
/account                       Who you are: type, level, subjects
/progress                      Your marks, weakest topics first
/teach                         Class share links and bulk packs
/family                        Follow a learner, with their consent
/s/[token]                     A list a teacher handed a class (no account)
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

### Role-aware surfaces

```
Student      /home leads with papers and notes · /progress · resume unfinished
Teacher      /home leads with planning material · /teach share links + packs
Parent       /family — request, learner consents, summary only
Institution  /home leads with planning and reference material
```

`account_type` chooses what leads. It never gates anything: every surface above
is reachable by every account, and permissions remain entirely a matter of
`profiles.role` and row level security. The signup form cannot grant an ability.

### Consent, for the parent view

```
guardian ──invite by exact email──► link created as `pending`
learner  ──sees it on /family────► accepts ──► `accepted`
                                  └─ declines ──► `revoked`
either   ──at any time───────────► `revoked`, no notice required

accepted opens exactly one door: guardian_learner_summary() and
guardian_learner_subjects(). Raw sessions and the progress views stay shut.
```

---

## 5. What is built

| Piece | State |
|---|---|
| `lib/resources.ts` — kind taxonomy, families, level applicability | **Built** |
| Playgroup / Baby Class level | **Built** |
| Subject taxonomy per level, CBE-accurate | **Built** |
| `/learn`, `/learn/[level]`, `/learn/[level]/[subject]` | **Built** |
| `resource_kind` filter through `/api/papers` | **Built** |
| Account types — student, teacher, parent, institution | **Built** |
| `/account` picker, `/home` arranged per account type | **Built** |
| Learner progress — summary, subjects, topics, trend | **Built** |
| Discovery shelves — picked for you, term essentials, new, most downloaded | **Built** |
| Similar resources on the detail page | **Built** |
| Teacher class-share links | **Built** |
| Teacher bulk download packs | **Built** |
| Parent/guardian view with consent | **Built** |
| National exam countdown | **Built** |
| Freshness badges | **Built** |
| Recently viewed + offline download queue | **Built** |
| Existing commerce, download gating, auth | **Already existed, untouched** |

Migrations 023–027. Eight verification harnesses run under `npm run verify`.

### The three rules that recur

Written down because each was arrived at separately and they turned out to be
the same rule:

1. **Never claim what is not known.** No countdown to an unverified date, no
   "Updated for 2026" derived from a null year, no "most downloaded this week"
   computed from a lifetime total, no "New for 2026" quietly containing 2024
   stock. Where the honest answer is silence, the component renders nothing.

2. **Preference is not permission.** `account_type` decides what is shown
   first and grants nothing. A share link shows a list and unlocks no download.
   A queued download is an intention, not an entitlement. Every one of these
   had an obvious implementation that was a privilege escalation with a
   friendly label.

3. **Enforce in the database, present in the app.** The role guard is a
   trigger, the progress views are `security_invoker`, the guardian door is a
   `SECURITY DEFINER` function checking consent. Each app route above them
   could be rewritten carelessly without opening anything.

## 6. What is not built

| Piece | Why not, and what it needs |
|---|---|
| **Printable booklet layout** | Its own typesetting problem, not a variation on the PDF renderer. A thin version produces something nobody prints. |
| **Assignment tracking** | A subsystem: setting work, collecting it, marking it, chasing it. Not a feature that fits beside share links. |
| **Recommended study plan for parents** | Needs the topic breakdown turned into advice. Advice a parent acts on should not come from a rule of thumb invented in an afternoon. |
| **Educator-verified badge** | Needs somebody to actually perform the review it claims. A badge asserting a verification that never happened is the worst item on this list. |
| **"Most downloaded this week"** | Needs a downloads-by-day table. Until then the shelf says "Most downloaded" and means it. |
| **Service worker / true offline** | The queue and recently-viewed survive a dropped connection; cached page shells do not. A service worker is a caching strategy with its own invalidation bugs and deserves its own pass. |
| **Institution seats** | The account type exists and leads planning material. Seat management, shared billing and a staff directory are a commerce change, not a UI one. |

## 7. Design language

Unchanged, and deliberately so. Every surface added here uses the tokens already
in `globals.css`: `sheet` for cards with the ruled red margin that inks in on
hover, `overline` for the mono kickers, `title-1`/`title-2` in Syne, `figure` for
anything numeric, `chip` for filters, `rail-x` for horizontal scrollers on
mobile. Blue is action, amber is money, red is marks, green is free. No new
colour, no new radius, no new shadow, no new font.

The one pattern added is the **kind tile** on `/learn` — and it is `sheet` with a
different arrangement of the same parts, not a new component idea.
