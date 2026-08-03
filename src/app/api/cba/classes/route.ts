import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { requireUser } from '@/utils/auth/guards';

/**
 * CLASS REGISTERS
 *
 * GET  /api/cba/classes   the teacher's own registers, with learners
 * POST /api/cba/classes   create one, optionally with the whole class at once
 *
 * Ownership is enforced by row level security — `class_groups_own` and
 * `class_learners_own` in migration 032 — so nothing here filters by teacher.
 * These tables hold named children, and the rule that exactly one teacher can
 * read a register belongs in the database rather than in a route that will be
 * rewritten.
 */

const MAX_LEARNERS = 100;

export async function GET() {
    const supabase = await createClient();
    const { failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    const { data, error } = await supabase
        .from('class_groups')
        .select('id, name, grade_label, learning_area, year, created_at, class_learners(id, name, admission_number)')
        .order('year', { ascending: false })
        .order('created_at', { ascending: false });

    if (error) {
        console.error('GET /api/cba/classes failed:', error.message);
        return NextResponse.json({ error: 'Could not load your classes' }, { status: 500 });
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    return NextResponse.json({
        classes: (data ?? []).map((c: any) => ({
            id: c.id,
            name: c.name,
            gradeLabel: c.grade_label,
            learningArea: c.learning_area,
            year: c.year,
            // Sorted by name so the app matches the register a teacher reads
            // from. A list in insertion order is a list somebody loses their
            // place in halfway through a class.
            learners: (c.class_learners ?? [])
                .map((l: any) => ({
                    id: l.id,
                    name: l.name,
                    admissionNumber: l.admission_number,
                }))
                .sort((a: any, b: any) => a.name.localeCompare(b.name)),
        })),
    });
}

export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { user, failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
    }

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
    if (!name) return NextResponse.json({ error: 'Give the class a name' }, { status: 400 });

    const { data: group, error } = await supabase
        .from('class_groups')
        .insert({
            created_by: user.id,
            name,
            grade_label: typeof body.grade_label === 'string' ? body.grade_label.slice(0, 40) : null,
            learning_area: typeof body.learning_area === 'string' ? body.learning_area.slice(0, 120) : null,
            year: Number.isFinite(Number(body.year)) ? Number(body.year) : new Date().getFullYear(),
        })
        .select('id, name, grade_label, learning_area, year')
        .single();

    if (error) {
        console.error('POST /api/cba/classes failed:', error.message);
        return NextResponse.json({ error: 'Could not create the class' }, { status: 500 });
    }

    /*
     * The register can be pasted in as one block of names.
     *
     * Typing fifty children into fifty separate fields on a phone is the kind of
     * setup cost that stops a tool being adopted at all. A teacher already has
     * the list somewhere — a register, a WhatsApp message, a printout — and one
     * name per line is what that paste looks like.
     */
    const rawNames = typeof body.learners === 'string' ? body.learners.split('\n') : [];
    const learners = rawNames
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, MAX_LEARNERS)
        .map((line) => {
            // "12 Achieng Otieno" or "Achieng Otieno" — a leading number is an
            // admission number, which teachers paste as often as not.
            const match = line.match(/^(\d{1,10})[\s.,-]+(.+)$/);
            return match
                ? { class_id: group.id, admission_number: match[1], name: match[2].slice(0, 120) }
                : { class_id: group.id, admission_number: null, name: line.slice(0, 120) };
        });

    if (learners.length > 0) {
        const { error: learnerError } = await supabase.from('class_learners').insert(learners);
        if (learnerError) {
            // The class exists and is usable; only the roster failed. Said
            // plainly rather than rolled back, so the teacher does not retype
            // everything.
            console.error('Adding learners failed:', learnerError.message);
            return NextResponse.json(
                {
                    class: group,
                    warning: 'The class was created but the names could not be saved. Add them again.',
                },
                { status: 201 }
            );
        }
    }

    return NextResponse.json({ class: group, learnerCount: learners.length }, { status: 201 });
}

/**
 * PATCH /api/cba/classes — rename a class, or correct its details.
 *
 * The register itself is not edited here: adding and removing learners is a
 * different shape of operation and belongs with the roster, not with the four
 * fields that describe the class.
 */
export async function PATCH(req: NextRequest) {
    const supabase = await createClient();
    const { failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
    }

    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'Which class?' }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (typeof body.name === 'string') {
        const name = body.name.trim().slice(0, 120);
        if (!name) return NextResponse.json({ error: 'Give the class a name' }, { status: 400 });
        patch.name = name;
    }
    if ('grade_label' in body) {
        patch.grade_label = typeof body.grade_label === 'string' ? body.grade_label.slice(0, 40) : null;
    }
    if ('learning_area' in body) {
        patch.learning_area =
            typeof body.learning_area === 'string' ? body.learning_area.slice(0, 120) : null;
    }
    if ('year' in body && Number.isFinite(Number(body.year))) {
        patch.year = Number(body.year);
    }

    if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
    }

    // Row level security restricts this to the teacher who created it, so a
    // class belonging to somebody else comes back as no rows rather than as a
    // refusal — indistinguishable from one that does not exist, which is right.
    const { data, error } = await supabase
        .from('class_groups')
        .update(patch)
        .eq('id', id)
        .select('id, name, grade_label, learning_area, year')
        .maybeSingle();

    if (error) {
        console.error('PATCH /api/cba/classes failed:', error.message);
        return NextResponse.json({ error: 'Could not update the class' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

    return NextResponse.json({ class: data });
}

/**
 * DELETE /api/cba/classes?id=… — remove a class and everything filed under it.
 *
 * `class_learners` and `cba_assessments` both cascade from here, and
 * `cba_scores` cascades from those — so this is the one delete in the product
 * that legitimately takes a lot with it. That is fine, because all of it
 * belongs to the same teacher: their register, their assessments, their
 * scoring. Nobody else's work is inside a class.
 *
 * The exception is an assessment that has been submitted. The head is required
 * to retain the evidence behind a submitted score, so a submitted assessment is
 * not the teacher's alone to throw away.
 *
 * What went is counted first and reported back, because a delete that silently
 * takes four hundred scores with it should at least say so.
 */
export async function DELETE(req: NextRequest) {
    const supabase = await createClient();
    const { failure } = await requireUser(supabase);
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Which class?' }, { status: 400 });

    const { data: group } = await supabase
        .from('class_groups')
        .select('id, name')
        .eq('id', id)
        .maybeSingle();

    if (!group) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

    const { data: assessments } = await supabase
        .from('cba_assessments')
        .select('id, submitted_at')
        .eq('class_id', id);

    const submitted = (assessments ?? []).filter((a: { submitted_at: string | null }) => a.submitted_at);
    if (submitted.length > 0) {
        return NextResponse.json(
            {
                error: `This class has ${submitted.length} submitted assessment${
                    submitted.length === 1 ? '' : 's'
                }, and the evidence behind a submitted score has to be kept. Delete the unsubmitted ones instead.`,
            },
            { status: 409 }
        );
    }

    const assessmentIds = (assessments ?? []).map((a: { id: string }) => a.id);

    const { count: learnerCount } = await supabase
        .from('class_learners')
        .select('id', { count: 'exact', head: true })
        .eq('class_id', id);

    let scoreCount = 0;
    if (assessmentIds.length > 0) {
        const { count } = await supabase
            .from('cba_scores')
            .select('id', { count: 'exact', head: true })
            .in('assessment_id', assessmentIds);
        scoreCount = count ?? 0;
    }

    const { error } = await supabase.from('class_groups').delete().eq('id', id);
    if (error) {
        console.error('DELETE /api/cba/classes failed:', error.message);
        return NextResponse.json({ error: 'Could not delete the class' }, { status: 500 });
    }

    return NextResponse.json({
        message: `“${group.name}” was deleted`,
        removed: {
            learners: learnerCount ?? 0,
            assessments: assessmentIds.length,
            scores: scoreCount,
        },
    });
}
