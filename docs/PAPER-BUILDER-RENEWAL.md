# Renewing the paper builder

What the assembly engine has to become before a Kenyan school will hand its
output to a class, why the obvious route there is the wrong one, and what to
build in what order.

This document responds to the *Exam-Set Paper Builder Renewal* proposal. That
proposal is right about the destination and wrong about the starting point, in
ways that would have wasted its own first two phases. Both halves are recorded
here — the corrections briefly, the corrected design at length.

---

## 1. The one change of subject

The proposal reads as "add constraints to `assemblePaper`": sections, topic
weights, Bloom's floors, a time check, each a new pass over the pool. Every one
of those is worth having. Arranged that way they still produce a bag of
questions weighing 70 marks.

A school does not ask for a bag of questions weighing 70 marks. It asks for
*Grade 9 Integrated Science: Section A, 30 multiple-choice; Section B,
structured; 70 marks; 1 hour 40*. That sentence is a thing — it has a name, it
is recognisable across schools, it is reused every term, and it is the artefact a
head of department argues about. It is not a by-product of a selection
algorithm.

So: **the paper format is the product, and the assembler is a small thing that
executes it.** The format is declared as data, named, saved, printed and shared.
Selection reads it and reports honestly against it. Everything else in this
document follows from that inversion.

The trade is that a format can be declared which the question bank cannot fill.
That is not a defect to engineer away — it is the truth, and section 4 is about
making it useful.

---

## 2. Six principles

### 2.1 Declare the format; do not infer it

`splitIntoSections` (`src/services/paperLayout.ts:246`) already produces
`SECTION A — Objective Questions` and `SECTION B — Structured Questions`, with
per-section instructions, mark sums and examiner rows. It does so by
reverse-engineering the sections from the question order: objective questions
must occupy a contiguous run before every non-objective one (`cleanlySplit`,
line 253). Where they do not, the paper renders as a single undifferentiated
list. That caution is right for a hand-set paper — reordering somebody's paper to
fit a convention is worse than not having the convention.

It is fatal for an auto-built one. `assemblePaper` finishes by sorting
Easy → Medium → Difficult, then topic (`src/services/paperBuilder.ts:205`).
Multiple-choice questions spread across three difficulty tiers are never
contiguous, so `cleanlySplit` is false and the section machinery never fires.
**The render half of "sections" has been built the whole time; the builder's own
final sort is what suppresses it.**

Sections are therefore declared by the format, assigned to questions during
selection, and rendered as given. `paperLayout` keeps its inference, demoted to
the fallback for papers assembled by hand.

### 2.2 Honesty over completion — never silently substitute

The best property of the current engine is that it stops at the mark ceiling and
says so when the bank runs dry. The renewal must extend that instinct, not
dilute it.

If Section A asks for 30 multiple-choice questions and the bank holds four, the
paper must not quietly close the gap with 26 marks of structured questions that
happen to fit. It places the four, leaves the section visibly short, and says
what is missing:

> Section A: 4 of 30 multiple-choice questions placed. 26 missing.

A generator that pads is a generator that embarrasses a teacher in front of a
class, because the substitution is invisible until the paper is printed. The
existing "top-up from any difficulty" pass (`paperBuilder.ts:170`) is exactly
this behaviour at the difficulty level, and it is acceptable only because
difficulty is a soft property of a question. Section membership is not soft: a
structured question in the objective section is a mistake, not a compromise.

### 2.3 Feasibility is the main feature, not a nicety

A thin bank is not an error state. It is the normal condition of every school in
its first term on the platform, and it is the condition of this deployment today
(section 5). A builder that can only answer *here is your paper* has nothing to
say to a school that has not yet stocked its bank — which is every new school.

So the first thing built is not the assembler. It is a pure

```ts
planFeasibility(pool, plan): FeasibilityReport
```

that answers *can this format be filled, and if not, what exactly is missing*
before anything is assembled. That turns an empty bank from a dead end into a
worklist — "26 one-mark multiple-choice questions, strands: Mixtures, Elements
and Compounds" — and every route to fill it already exists: the question entry
modal, `EnhancedBulkImport`, PDF extraction (`src/services/questionExtraction.ts`)
and AI authoring (`src/services/claude.ts`), each of which can be opened
pre-filtered to the deficit.

It is also the only part of this design that is fully testable today, against a
synthetic bank, with no real questions at all.

### 2.4 The mark ceiling is a default, not a law

The proposal's first design principle is that a paper never exceeds the target,
and it holds that invariant across every template including the senior ones.
KCSE Mathematics Paper 1 breaks it:

> **Section I** (50 marks) — 16 questions, answer **all**.
> **Section II** (50 marks) — 8 questions, answer **any five**.

A paper worth 100 marks to the candidate must *print* about 130 marks of
questions. No setting of the proposal's `targetMarks` / `targetCount` /
`minCount` / `maxCount` expresses a section where the number set exceeds the
number answered, so KCSE-style papers are simply unrepresentable in it. This is
not a corner case; it is the dominant senior format across Mathematics, the
sciences and the humanities.

The model needs `answerAny`, and the invariant becomes:

> **Scored marks never exceed the target. Printed marks are whatever the format
> declares.**

Both are carried on the result. The mark table prints the scored figure, because
that is the number the candidate is marked out of.

### 2.5 Curriculum vocabulary is closed data

`src/lib/curriculum.ts` already states the doctrine, and it is correct:

> A generator with no list to work from invents. It produces "Number Patterns"
> for a Grade 1 class that has not met a pattern […] So the list is exhaustive,
> `isKnownTopic` is the gate, and anything not in here is not a topic — it is a
> mistake.

Strand weighting for junior and senior has to work the same way.
`questions.topic` is free text (`varchar(200)`; 36 distinct values across 253
rows, including near-duplicates), and a percentage target computed against free
text enforces nothing — it measures the spelling of tags, not the coverage of a
syllabus. `src/utils/topicMatcher.ts` already exists for the matching half.

So the strand lists extend the `curriculum.ts` pattern upward from lower primary,
and strand weighting is expressed against that closed list. Until a subject's
list exists, that subject's format simply carries no strand weights — an absence,
not an invented default.

### 2.6 Enforce only what the data can support; report the rest

251 of the 253 questions in the bank carry Bloom's `'Knowledge'`. That is the
column default (`blooms_level blooms_level DEFAULT 'Knowledge'`), not a judgement
anyone made. A Bloom's floor computed over defaulted data enforces nothing while
looking rigorous — which is worse than not having it, because it produces a
green quality flag on a paper nobody checked.

The proposal's "discrimination" hook has the same problem from the other end: 8
of 253 questions have ever been used, so `usage_count` currently distinguishes
nothing.

Both are reported in the breakdown and gate nothing. Difficulty and question
type — which teachers do set deliberately, on every question, through the entry
form — carry the load. When Bloom's tagging becomes real, promoting it from
reported to enforced is a one-line change in the same pass structure.

---

## 3. What the codebase already gives us

### 3.1 Reuse

`paperLayout.ts` is further ahead than the proposal assumes. It already models
`PaperSection` with label, title, instruction, mark total and questions; builds
examiner rows per section; writes a standard Kenyan instruction set when the
setter leaves the box empty; and emits CBC performance-level rubrics for CBC
grades. The render half needs an *input contract*, not a rewrite.

`paperBuilder.ts` keeps everything that earned its place: `marksOf` (sub-part
aware), Fisher-Yates `shuffle`, `preferUnused`, `normaliseMix`, the paged
`fetchQuestionPool` with its timeout handling, and above all the pure/I-O split
that lets `npm run verify:builder` exercise the selection rules with no database
at all. That split is the reason this renewal is safe to attempt.

`src/lib/catalog.ts` already owns the level taxonomy (`LevelSlug`, line 17, with
`dbLevel`/`dbBand` mapping onto the `grades` table) and the exam types
(`ExamTypeSlug`, line 132). A format resolves against those, not against a new
parallel vocabulary.

### 3.2 Retire

`src/services/paperGenerationService.ts`, the `paper_templates` table,
`/admin/templates` and `/api/paper/generate` are a **second, section-aware
engine** that the proposal does not mention. `TemplateSectionConfig`
(`src/types/index.ts:328`) carries `section_label`, `section_type`,
`question_count`, `marks_per_question`, `topics` and `instructions`, and
`generatePaper` fills each section in turn, prefers least-used questions and
de-duplicates across sections — which is, in outline, the "Pass 1" the proposal
plans to write from scratch.

It is dead and it is broken:

- `paper_templates` holds **0 rows**. Nothing has ever run through it.
- Its topic filter queries `questions.topic_id` (`paperGenerationService.ts:96`),
  a column that does not exist. The table has `topic varchar` and `strand_id`.
  Any section with topics returns nothing, silently.
- It filters on `questions.section_type`, which is null on all 253 rows
  (`paperGenerationService.ts:81`).
- It is I/O-coupled — every selection decision needs a live Supabase client — so
  unlike `assemblePaper` it has never had a verify script and cannot easily be
  given one.

**Consolidate on `paperBuilder`.** It is pure, it is tested, and it is what
`/set` actually calls. Salvage the vocabulary that was right — `section_label`,
per-section `instructions`, `shuffle_within_sections` — and delete the rest in
the same commit that lands the renderer contract, so the repository is never in a
state with three engines in it.

### 3.3 Correct

The proposal's types are written in vocabulary this codebase does not use.
Adopted verbatim they break the bank filter, the entry form, the extractor and
the renderer, all of which match on the existing string values.

| Proposal | Actual |
|---|---|
| `'MCQ'`, `'TrueFalse'`, `'Project'` | `'Multiple Choice'`, `'True/False'` (`src/types/index.ts:54`). There is no `Project`; there are `Practical`, `Oral`, `Numeric`, `Fill-in-the-blank` |
| Bloom's `Remember … Create` | `Knowledge \| Understanding \| Application \| Analysis \| Evaluation \| Creation` (`src/types/index.ts:2`) — a Postgres enum, so renaming is a migration, not an edit |
| a new `src/types/paperBlueprint.ts` | `PaperBlueprint` already exists at `src/types/shop.ts:174` |
| `topics?` / `questionTypes?` optional | both are **required** today and read unguarded at `paperBuilder.ts:89`; widening them to optional needs the guard added in the same change |
| `level` / `grade` on the blueprint | already carried by `grades.level` (`junior`/`senior`/`primary`) and `grades.band` (`jss`/`sss`), mapped by `catalog.ts:17` |

Two further corrections that will bite during implementation:

**The `grades` table holds drift.** `Grade 10` exists twice — once with
`band: 'sss'`, once with `band: null` — and one `Grade 9` row has `level: null`.
Any format lookup that resolves a level from a grade row must tolerate this or it
will resolve the wrong format for a real school. Cleaning the rows is the better
fix and belongs with this work.

**The time estimate is calibrated for the wrong thing.**
`paperStats.estimatedMinutes` is `marks × 1.2 + count × 0.5`
(`paperBuilder.ts:283`). Applied to a KJSEA Section A of 30 one-mark
multiple-choice questions, that predicts 51 minutes for what KNEC allots roughly
30. A `timeOk` flag built on it would be confidently wrong on exactly the papers
this renewal exists to produce. Rates become per-type — objective questions
priced per question, structured and essay work priced per mark.

---

## 4. The bank, and what it means for sequencing

The live bank is 253 rows of trial data. Recorded here not as a defect list but
because it sets what any of this can be tested against:

| | |
|---|---|
| Multiple-choice questions | **0** — and 0 rows carry any `options` |
| Questions with sub-parts | **0** |
| Bloom's other than the `'Knowledge'` default | **2** of 253 |
| Mean marks per question | **1.00** — a 100-mark paper needs ~100 questions |
| Questions ever used | **8** |
| Marking schemes | 50 of 253 |
| Senior (Grade 10–12) questions | **0** |
| Usable pools | Grade 9 Pre-Technical (151 questions, 31 topics); Grade 4 Social Studies (50 / 2 topics); Grade 8 Pre-Technical (50 / 1 topic) |

Every JSS format in the proposal opens with a 20- or 30-mark multiple-choice
Section A. Against this bank each one returns a 100 % shortfall on its first
section. Every Phase-1 unit test the proposal specifies would today assert on an
empty result.

This is why the sequence in section 7 leads with formats-as-data and
feasibility rather than with the multi-pass assembler. Feasibility is *fully
exercisable now*, against a synthetic bank, and it is the piece that stays
useful for as long as the bank is thin — which, for a school onboarding next
term, is the entire period during which it decides whether to trust this
product.

---

## 5. What Kenyan institutions need that the proposal omits

These change the design; they are not decoration.

**A term paper is not a miniature national paper.** Schools set openers,
mid-terms, end-terms, CATs and mocks — `ExamTypeSlug` already enumerates them.
A 30-mark CAT covers *what has been taught so far this term*, not a
representative sample of the year's syllabus. A format therefore carries a
**coverage window**, and strand weighting is computed inside it. Judging a CAT
against the full-year strand list would flag a perfectly good paper as
unbalanced, and a teacher who is told their correct paper is wrong stops reading
the warnings.

**KJSEA is 60 % written and 40 % School-Based Assessment.** The proposal never
says so. This builder addresses the 60 %. The other half — projects, practicals,
portfolios — is already touched by CBA capture (`src/app/api/cba/`, migration
032). Naming the boundary keeps anyone from describing a paper builder as KJSEA
readiness.

**Kiswahili and Fasihi papers must print Kiswahili headings** — `SEHEMU A`,
`Jibu maswali YOTE`. `paperLayout` hardcodes English labels and the English
instruction set. A format declares its language and supplies its own labels; the
renderer prints what it is given. A Kiswahili paper with `SECTION A` at the top
is not a Kiswahili paper.

**A paper without a marking scheme is half a product.** 50 of 253 questions
carry one. A school printing 40 copies needs the scheme as much as the paper, so
scheme completeness belongs in the same feasibility report as the question
deficits — surfaced before the paper is built, not discovered at the printer.

**A format a school has agreed on must be reusable and freezable.** Departments
standardise: every Form 2 end-term Chemistry paper the same shape, year after
year, so results compare across terms. Formats are named and saved; a generated
paper freezes the format it was built from, so it can be reproduced and audited
later. `exam_sets` (migration 038) already groups a sitting, and a shared format
is its natural companion.

---

## 6. The design

Names are indicative; the types are the contract.

```ts
// src/types/paperPlan.ts — repo vocabulary throughout

export interface SectionPlan {
    /** 'A', 'B', 'I', 'II' — stable, used for ordering and reporting. */
    id: string;
    /** Printed heading: 'SECTION A' | 'SEHEMU A'. */
    label: string;
    title: string;
    /** Printed verbatim under the heading. */
    instruction: string;
    /** Repo vocabulary: 'Multiple Choice' | 'Structured' | 'Essay' | … */
    types: QuestionType[];
    /** Scored marks for this section. */
    marks: number;
    /** How many questions to print. */
    questionsSet?: number;
    /** How many the candidate answers. Absent = all. KCSE Section II sets 8, answers 5. */
    answerAny?: number;
    marksPerQuestion?: number;
    difficulties?: Difficulty[];
    strands?: string[];
}

export interface PaperPlan {
    id: string;
    name: string;
    /** 'knec' formats are quoted from a published structure; 'school' and 'custom' are not. */
    origin: 'knec' | 'school' | 'custom';

    level: LevelSlug;
    gradeLabel: string;
    subject: string;
    examType: ExamTypeSlug;

    scoredMarks: number;
    durationMinutes: number;
    language: 'en' | 'sw';

    sections: SectionPlan[];

    /** What has actually been taught — a CAT is judged inside this window. */
    coverage?: { strands: string[] };
    strandWeights?: { strand: string; percent: number }[];
    difficultyMix: Record<Difficulty, number>;

    preferUnused: boolean;
    avoidDuplicates: boolean;

    /** Provenance. A format that goes stale should be visible, not authoritative. */
    verifiedOn?: string;
    provisional?: boolean;
    sourceUrl?: string;
}
```

Feasibility is the piece a teacher reads:

```ts
export interface Deficit {
    sectionId: string;
    need: number;              // questions
    have: number;
    types: QuestionType[];
    strands?: string[];
    marksEach?: number;
    /** A sentence a teacher can act on, not a code. */
    message: string;
}

export interface FeasibilityReport {
    fillable: boolean;
    deficits: Deficit[];
    schemeGaps: number;        // placed questions with no marking scheme
    estimatedMinutes: number;  // per-type rates
    withinDuration: boolean;
}

export function planFeasibility(pool: DBQuestion[], plan: PaperPlan): FeasibilityReport;
```

Assembly returns section-assigned questions, both mark totals, and the same
report re-evaluated against what was actually placed:

```ts
export interface PlannedAssembly {
    sections: {
        plan: SectionPlan;
        questions: DBQuestion[];
        printedMarks: number;
        scoredMarks: number;
    }[];
    /** Flat, in section order — what /set and the renderer consume today. */
    questions: DBQuestion[];
    scoredMarks: number;
    printedMarks: number;
    difficultyBreakdown: Record<Difficulty, { targetMarks: number; actualMarks: number; count: number }>;
    strandBreakdown: Record<string, { targetMarks: number; actualMarks: number }>;
    feasibility: FeasibilityReport;
    notes: string[];
}
```

The existing `assemblePaper(pool, blueprint, existing)` keeps working unchanged
for a plain `PaperBlueprint`. `/set` and `verify:builder` never break mid-flight;
the planned path is additive until the UI moves to it.

**Files**

```
src/types/paperPlan.ts                     new — plan + feasibility types
src/lib/paperFormats/{jss,senior,primary,index}.ts
                                           new — the catalogue as data, dated and sourced
src/services/paperBuilder.ts               planFeasibility + section-aware assembly, still pure
src/services/paperLayout.ts                accepts declared sections; language-aware labels
src/app/set/page.tsx                       format picker; feasibility panel
src/components/setter/AutoBuildModal.tsx   "use the official format" as the default path
scripts/verify-paper-builder.mjs           extended: sections, answerAny, deficits

deleted:
src/services/paperGenerationService.ts
src/app/admin/templates/page.tsx
src/app/api/paper/generate/route.ts
```

---

## 7. Sequence

Each phase is useful against the bank as it stands.

**1 — Formats as data, and feasibility.** Types, the verified catalogue, pure
`planFeasibility`, extended verify script. Ships a truthful answer to "can this
school produce a KJSEA-shaped Integrated Science paper?" — today, *no, and here
are the 30 multiple-choice questions it needs*. No UI change, nothing breaks.

**2 — Section-aware assembly.** Multi-pass fill, per-section ceilings,
`answerAny`, scored versus printed marks, section-ordered output. That ordering
alone makes the existing renderer emit Section A and Section B, closing the gap
described in 2.1. Every invariant gets verify coverage: section ceilings, the
overall scored ceiling, type restriction per section, no duplicates, honest
deficits.

**3 — Renderer contract, and retirement.** `paperLayout` accepts declared
sections and keeps inference as the hand-set fallback; Kiswahili labels; mark
table per section. The dead template engine is deleted in the same commit.

**4 — The setter.** "Use the official format" as the default path, chosen from
grade + subject + exam type. Live feasibility panel with one-click routes into
entry, import, extraction or AI authoring, each pre-filtered to the deficit.
Format editing collapsed behind advanced controls.

**5 — Institutional.** Save a school's own format. Freeze the format onto a
saved paper so it can be reproduced. Share formats within a sitting. Surface
marking-scheme completeness alongside the paper.

**Deferred, with reasons.** Bloom's floors — until tagging is real rather than
defaulted (2.6). Item discrimination — until `usage_count` distinguishes
anything. Senior pathway and project awareness — until the formats settle: KNEC
is running Grade 10 school-based projects and practicals in Term 2 with written
tests in Term 3 for 2026, while KCSE continues in parallel, and a template
written against a moving format is worse than none.

---

## 8. The formats, and their provenance

The proposal's junior table substantially holds up against published sources.
KJSEA Mathematics is Section A (20 multiple-choice marks) plus Section B
(80 marks structured); Integrated Science Section A is 30 multiple-choice marks.
Its central conclusion is confirmed: **multiple-choice is first-class at junior
level and must not be forced at senior level**, where the published formats are
structured and essay throughout.

Two corrections belong on the record. KJSEA is 60 % written and 40 %
school-based, which the proposal never states (section 5). And the senior picture
is less settled than "emerging CBE" implies — hence `provisional` on every senior
entry.

Every catalogue entry carries `sourceUrl` and `verifiedOn`. A format nobody has
re-checked in a year should look unchecked, not authoritative.

- [How Grade 9 learners will be examined — Daily Nation](https://nation.africa/kenya/news/education/how-grade-9-learners-will-be-examined-5172378)
- [Guidelines and schedule for Grade 9 KJSEA projects — KNEC](https://www.knec.ac.ke/guidelines-and-schedule-for-grade-9-kjsea-projects/)
- [KNEC guidelines for 2026 Grade 10 and vocational school-based assessments](https://www.kenyans.co.ke/news/124828-knec-issues-guidelines-2026-grade-10-and-vocational-school-based-assessments)
- [KCSE Mathematics Paper 1 structure](https://www.studocu.com/row/document/university-of-nairobi/mathematics/maths-pp1-exam-2025-kcse-mathematics-paper-1-questions/130892744)
- [A look at Grade 9 KJSEA papers and question setups](https://cbc.co.ke/a-look-at-grade-9-kjsea-exam-papers-and-question-setups/)

---

## 9. What "done" means

The proposal's success criteria are mostly restatements of its own flags. These
are the ones worth holding to:

- A Grade 9 Integrated Science paper built from the official format prints
  `SECTION A` with 30 multiple-choice questions and `SECTION B` structured — or
  says precisely which of those it could not do, before it is printed.
- A KCSE-style Mathematics paper prints 8 questions in Section II under
  "answer any five", and its mark table reads 100.
- A Kiswahili paper prints `SEHEMU A`.
- A school with an empty bank gets a worklist, not an error.
- No paper contains a question whose type its section does not allow.
- `npm run verify:builder` covers every invariant above without a database.
