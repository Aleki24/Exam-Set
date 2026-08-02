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
    const { actor, failure } = await requireUser(supabase);
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
            created_by: actor.id,
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
