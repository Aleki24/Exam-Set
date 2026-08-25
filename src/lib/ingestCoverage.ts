/**
 * WHAT THE BANK ALREADY HOLDS, AT STRAND RESOLUTION
 * ----------------------------------------------------------------------------
 * `/api/ingest/curriculum` answers one question for a model about to write
 * questions: where are the holes? It used to answer only at subject-and-grade —
 * "Grade 9 Mathematics: 0 approved, 30 pending" — which is not a hole anybody
 * can write toward. It names no part of the syllabus.
 *
 * `topic` is the strand. `submit_questions` requires it and documents it as the
 * KICD strand; `paperBuilder` filters sections on it. The `strands` table and
 * `questions.strand_id` are not involved: the table holds no rows and the column
 * is null on every question in the bank, while `topic` is populated on all of
 * them. So the taxonomy that exists in practice is this string, and it is the
 * one worth reporting.
 *
 * The second job is spelling. The shop filters on the literal value, so
 * "Algebra" and "Algebraic Expressions" are two unrelated strands to every query
 * in the system. Publishing the strings already in use is what stops each run
 * coining a synonym for a strand the bank already has.
 *
 * Pure, so `verify:ingest` can cover it without a database.
 */

export interface CoverageRow {
    subject_id?: string | null;
    grade_id?: string | null;
    review_status?: string | null;
    topic?: string | null;
}

export interface TopicCoverage {
    topic: string;
    approved: number;
    pending: number;
}

export interface PairingCoverage {
    subject: string | null;
    grade: string | null;
    approved: number;
    pending: number;
    /** Thinnest first — the model reads top-down and the top is the shortage. */
    topics: TopicCoverage[];
}

export interface CoverageReport {
    coverage: PairingCoverage[];
    /** Every topic spelling in use anywhere, sorted. */
    topicsInUse: string[];
}

function cleanTopic(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function summariseCoverage(
    rows: CoverageRow[],
    subjectName: Map<string, string>,
    gradeName: Map<string, string>
): CoverageReport {
    const tally = new Map<
        string,
        { approved: number; pending: number; topics: Map<string, { approved: number; pending: number }> }
    >();

    for (const row of rows) {
        const key = `${row.subject_id ?? 'none'}|${row.grade_id ?? 'none'}`;
        const cell = tally.get(key) ?? { approved: 0, pending: 0, topics: new Map() };

        const approved = row.review_status === 'approved';
        const pending = row.review_status === 'pending';
        if (approved) cell.approved++;
        else if (pending) cell.pending++;

        // A question in any other state — rejected, say — still counts as a use
        // of the topic. It is evidence of the spelling, which is what the
        // vocabulary is for, even though it is not stock.
        const topic = cleanTopic(row.topic);
        if (topic) {
            const t = cell.topics.get(topic) ?? { approved: 0, pending: 0 };
            if (approved) t.approved++;
            else if (pending) t.pending++;
            cell.topics.set(topic, t);
        }

        tally.set(key, cell);
    }

    const coverage: PairingCoverage[] = [...tally.entries()]
        .map(([key, cell]) => {
            const [subjectId, gradeId] = key.split('|');
            return {
                subject: subjectName.get(subjectId) ?? null,
                grade: gradeName.get(gradeId) ?? null,
                approved: cell.approved,
                pending: cell.pending,
                topics: [...cell.topics.entries()]
                    .map(([topic, t]) => ({ topic, approved: t.approved, pending: t.pending }))
                    .sort((a, b) => a.approved - b.approved || a.topic.localeCompare(b.topic)),
            };
        })
        .sort((a, b) => b.approved - a.approved);

    const topicsInUse = [...new Set(rows.map((r) => cleanTopic(r.topic)).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
    );

    return { coverage, topicsInUse };
}
