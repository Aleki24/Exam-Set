'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, FileUp, Loader2, Lock, Upload, X } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import { useRole } from '@/lib/roles';
import { EXAM_TYPES, EXAM_TYPE_GROUPS, LEVELS, TERMS, catalogYears, formatPrice } from '@/lib/catalog';
import { canSuggestSet, describeSet, suggestSetName, type ExamSetSummary, type SetFields } from '@/lib/examSets';

/**
 * Which sitting the paper being uploaded belongs to.
 *
 *   ''            not part of a set — the default
 *   '<uuid>'      an existing set the uploader picked
 *   'new'         create one, named `newSetName`
 */
type SetChoice = { mode: '' | 'new' | 'existing'; setId?: string; newSetName: string };

/**
 * Upload a paper for sale. Admin and owner only — this is how the shop gets
 * stocked with past papers, county mocks and school exams.
 */
export default function UploadPaperPage() {
    const router = useRouter();
    const { isAdmin, ready, signedIn, staleSession } = useRole();

    const paperInput = useRef<HTMLInputElement>(null);
    const schemeInput = useRef<HTMLInputElement>(null);

    const [paperFile, setPaperFile] = useState<File | null>(null);
    const [schemeFile, setSchemeFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);

    const [form, setForm] = useState({
        title: '',
        subject: '',
        description: '',
        exam_type: 'end-term',
        level_slug: 'junior-school',
        grade_label: '',
        term_slug: '',
        year: new Date().getFullYear(),
        paper_number: '',
        total_marks: '',
        question_count: '',
        time_limit: '',
        institution: '',
        price: 30,
        is_published: true,
    });

    const [setChoice, setSetChoice] = useState<SetChoice>({ mode: '', newSetName: '' });

    useEffect(() => {
        if (ready && !signedIn) router.push('/auth/login?next=/papers/new');
    }, [ready, signedIn, router]);

    const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!paperFile) {
            toast.error('Attach the question paper PDF');
            return;
        }
        if (!form.title.trim() || !form.subject.trim()) {
            toast.error('A title and subject are required');
            return;
        }

        setUploading(true);
        try {
            const body = new FormData();
            body.append('paper', paperFile);
            if (schemeFile) body.append('scheme', schemeFile);
            body.append(
                'meta',
                JSON.stringify({
                    ...form,
                    total_marks: form.total_marks ? Number(form.total_marks) : 0,
                    question_count: form.question_count ? Number(form.question_count) : 0,
                    price_cents: Math.round(form.price * 100),
                    // Exactly one of these, so the server never has to guess
                    // whether an id and a name disagree on purpose.
                    set_id: setChoice.mode === 'existing' ? setChoice.setId : undefined,
                    new_set:
                        setChoice.mode === 'new'
                            ? setChoice.newSetName.trim() || true
                            : undefined,
                })
            );

            const res = await fetch('/api/papers/upload', { method: 'POST', body });
            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || 'Upload failed');
                return;
            }

            toast.success(
                form.is_published
                    ? `"${form.title}" is live in the shop`
                    : `"${form.title}" saved as a draft`
            );
            router.push(`/papers/${data.paper.slug || data.paper.id}`);
        } catch {
            toast.error('Upload failed. Check your connection and try again.');
        } finally {
            setUploading(false);
        }
    };

    // An expired session and a genuine lack of permission both arrive here as
    // `!isAdmin`, but they need opposite advice. Telling an owner whose token
    // lapsed that "selling is for admins" sends them looking for a permissions
    // problem that does not exist.
    if (ready && signedIn && staleSession) {
        return (
            <div className="min-h-screen bg-background">
                <TopNav />
                <div className="shell-width py-20 text-center">
                    <Lock className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                    <h1 className="title-1">Your session has expired</h1>
                    <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                        You are still signed in on this device, but the server no longer accepts the session, so
                        it cannot confirm your account. Sign in again and this page will open normally.
                    </p>
                    <div className="mt-6 flex justify-center gap-2">
                        <Link href="/auth/login?next=/papers/new" className="btn-primary">
                            Sign in again
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    if (ready && signedIn && !isAdmin) {
        return (
            <div className="min-h-screen bg-background">
                <TopNav />
                <div className="shell-width py-20 text-center">
                    <Lock className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                    <h1 className="title-1">Selling is for admins</h1>
                    <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                        Only the shop owner and the admins they appoint can list papers for sale. You can still set
                        your own exams and save them to your library.
                    </p>
                    <div className="mt-6 flex justify-center gap-2">
                        <Link href="/set" className="btn-primary">
                            Set an exam
                        </Link>
                        <Link href="/" className="btn-outline">
                            Browse papers
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const grades = LEVELS.find((l) => l.slug === form.level_slug)?.grades ?? [];

    return (
        <div className="min-h-screen bg-background">
            <TopNav />

            <div className="shell-width max-w-3xl py-6">
                <Link
                    href="/admin"
                    className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Admin
                </Link>

                <p className="overline mb-2">Admin</p>
                <h1 className="display-2">Upload a paper for sale</h1>
                <p className="lead mt-3 text-sm sm:text-base">
                    The PDF is stored privately. Buyers only ever get a short-lived signed link, and only after they
                    have paid.
                </p>

                <form onSubmit={submit} className="mt-8 space-y-8">
                    {/* Files */}
                    <section className="surface p-5">
                        <div className="rule-heading">
                            <h2 className="overline">Files</h2>
                        </div>

                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <FilePicker
                                label="Question paper (PDF)"
                                required
                                file={paperFile}
                                inputRef={paperInput}
                                onPick={setPaperFile}
                            />
                            <FilePicker
                                label="Marking scheme (PDF, optional)"
                                file={schemeFile}
                                inputRef={schemeInput}
                                onPick={setSchemeFile}
                            />
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">
                            Papers that come with a marking scheme sell noticeably better — buyers filter for it.
                        </p>
                    </section>

                    {/* What it is */}
                    <section className="surface p-5">
                        <div className="rule-heading">
                            <h2 className="overline">What is this paper?</h2>
                        </div>

                        <div className="mt-4 space-y-4">
                            <div>
                                <label className="label" htmlFor="u-title">
                                    Title
                                </label>
                                <input
                                    id="u-title"
                                    className="field"
                                    value={form.title}
                                    onChange={(e) => set({ title: e.target.value })}
                                    placeholder="Grade 9 Integrated Science End of Term 2"
                                    required
                                />
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="label" htmlFor="u-subject">
                                        Subject / learning area
                                    </label>
                                    <input
                                        id="u-subject"
                                        className="field"
                                        value={form.subject}
                                        onChange={(e) => set({ subject: e.target.value })}
                                        placeholder="Integrated Science"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="label" htmlFor="u-type">
                                        Exam type
                                    </label>
                                    <select
                                        id="u-type"
                                        className="field"
                                        value={form.exam_type}
                                        onChange={(e) => set({ exam_type: e.target.value })}
                                    >
                                        {EXAM_TYPE_GROUPS.map((group) => (
                                            <optgroup key={group} label={group}>
                                                {EXAM_TYPES.filter((t) => t.group === group).map((t) => (
                                                    <option key={t.slug} value={t.slug}>
                                                        {t.name}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-3">
                                <div>
                                    <label className="label" htmlFor="u-level">
                                        Level
                                    </label>
                                    <select
                                        id="u-level"
                                        className="field"
                                        value={form.level_slug}
                                        onChange={(e) => set({ level_slug: e.target.value, grade_label: '' })}
                                    >
                                        {LEVELS.map((l) => (
                                            <option key={l.slug} value={l.slug}>
                                                {l.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="label" htmlFor="u-grade">
                                        Grade / Form
                                    </label>
                                    <select
                                        id="u-grade"
                                        className="field"
                                        value={form.grade_label}
                                        onChange={(e) => set({ grade_label: e.target.value })}
                                    >
                                        <option value="">Any</option>
                                        {grades.map((g) => (
                                            <option key={g} value={g}>
                                                {g}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="label" htmlFor="u-year">
                                        Year
                                    </label>
                                    <select
                                        id="u-year"
                                        className="field"
                                        value={form.year}
                                        onChange={(e) => set({ year: Number(e.target.value) })}
                                    >
                                        {catalogYears(1996).map((y) => (
                                            <option key={y} value={y}>
                                                {y}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-4">
                                <div>
                                    <label className="label" htmlFor="u-term">
                                        Term
                                    </label>
                                    <select
                                        id="u-term"
                                        className="field"
                                        value={form.term_slug}
                                        onChange={(e) => set({ term_slug: e.target.value })}
                                    >
                                        <option value="">—</option>
                                        {TERMS.map((t) => (
                                            <option key={t.slug} value={t.slug}>
                                                {t.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="label" htmlFor="u-paper-no">
                                        Paper no.
                                    </label>
                                    <input
                                        id="u-paper-no"
                                        className="field"
                                        value={form.paper_number}
                                        onChange={(e) => set({ paper_number: e.target.value })}
                                        placeholder="Paper 1"
                                    />
                                </div>
                                <div>
                                    <label className="label" htmlFor="u-marks">
                                        Total marks
                                    </label>
                                    <input
                                        id="u-marks"
                                        type="number"
                                        min={0}
                                        className="field"
                                        value={form.total_marks}
                                        onChange={(e) => set({ total_marks: e.target.value })}
                                        placeholder="60"
                                    />
                                </div>
                                <div>
                                    <label className="label" htmlFor="u-duration">
                                        Duration
                                    </label>
                                    <input
                                        id="u-duration"
                                        className="field"
                                        value={form.time_limit}
                                        onChange={(e) => set({ time_limit: e.target.value })}
                                        placeholder="2 Hours"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="label" htmlFor="u-institution">
                                    School / source (optional)
                                </label>
                                <input
                                    id="u-institution"
                                    className="field"
                                    value={form.institution}
                                    onChange={(e) => set({ institution: e.target.value })}
                                    placeholder="Kakamega County Joint Examination"
                                />
                            </div>

                            <SetPicker
                                fields={{
                                    institution: form.institution,
                                    exam_type: form.exam_type,
                                    term_slug: form.term_slug,
                                    year: form.year,
                                }}
                                value={setChoice}
                                onChange={setSetChoice}
                            />

                            <div>
                                <label className="label" htmlFor="u-description">
                                    Description (optional)
                                </label>
                                <textarea
                                    id="u-description"
                                    className="field min-h-20 resize-y"
                                    value={form.description}
                                    onChange={(e) => set({ description: e.target.value })}
                                    placeholder="What the paper covers, how many sections, whether answers are included."
                                />
                            </div>
                        </div>
                    </section>

                    {/* Price */}
                    <section className="surface p-5">
                        <div className="rule-heading">
                            <h2 className="overline">Price</h2>
                        </div>

                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="label" htmlFor="u-price">
                                    Price in KES (0 = free)
                                </label>
                                <input
                                    id="u-price"
                                    type="number"
                                    min={0}
                                    step={10}
                                    className="field"
                                    value={form.price}
                                    onChange={(e) => set({ price: Math.max(0, Number(e.target.value) || 0) })}
                                />
                                <p className="mt-1.5 text-xs text-muted-foreground">
                                    {form.price === 0
                                        ? 'Free papers still need a sign-in to download.'
                                        : `Buyers pay ${formatPrice(form.price * 100)} by M-Pesa.`}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Single papers on Kenyan sites typically go for KES 25–50. Price above that
                                    and buyers compare; a marking scheme is what justifies the premium.
                                </p>
                            </div>

                            <label className="flex items-start gap-2.5 pt-6 text-sm">
                                <input
                                    type="checkbox"
                                    checked={form.is_published}
                                    onChange={(e) => set({ is_published: e.target.checked })}
                                    className="mt-0.5 h-4 w-4 rounded border-input accent-[var(--primary)]"
                                />
                                <span>
                                    Publish immediately
                                    <span className="block text-xs text-muted-foreground">
                                        Uncheck to save it as a draft only admins can see.
                                    </span>
                                </span>
                            </label>
                        </div>
                    </section>

                    <div className="flex gap-2">
                        <Link href="/admin" className="btn-outline">
                            Cancel
                        </Link>
                        <button type="submit" disabled={uploading} className="btn-buy flex-1">
                            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            {uploading ? 'Uploading…' : form.is_published ? 'Upload & publish' : 'Save as draft'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/**
 * PART OF A SET
 *
 * A school sits one exam across a dozen subjects, and this is the only moment
 * anybody knows that: the uploader has just typed the school, the exam type, the
 * term and the year — the four things that name a sitting. Asking here costs one
 * click. Asking later means an admin reconciling twelve papers by hand.
 *
 * The control stays hidden until there is a school name, because without one
 * there is nothing to group by and an empty dropdown is just another field to
 * skip past.
 *
 * Existing sets are offered before a new one, and the suggested name is
 * pre-filled rather than imposed — "Kabras Mock Term 2 2025" is a reasonable
 * guess at what a school calls its sitting, and a poor substitute for what the
 * school actually calls it.
 */
function SetPicker({
    fields,
    value,
    onChange,
}: {
    fields: SetFields;
    value: SetChoice;
    onChange: (next: SetChoice) => void;
}) {
    const [matches, setMatches] = useState<ExamSetSummary[]>([]);
    const [loading, setLoading] = useState(false);

    const institution = (fields.institution ?? '').trim();
    const suggestion = suggestSetName(fields);
    const available = canSuggestSet(fields);

    /*
     * Debounced, because this runs while somebody is still typing a school name
     * and the answer for "Kabra" is not worth a request. 400ms is long enough
     * that a normal typing speed produces one query per word, not per letter.
     */
    useEffect(() => {
        if (!available) {
            setMatches([]);
            return;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/sets?institution=${encodeURIComponent(institution)}&limit=20`);
                const data = await res.json();
                if (!cancelled) setMatches(res.ok ? (data.sets ?? []) : []);
            } catch {
                // A set list that fails to load must not block an upload. The
                // uploader can still create a new set, and the server will match
                // it to the existing one by fingerprint anyway.
                if (!cancelled) setMatches([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 400);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [institution, available]);

    if (!available) return null;

    return (
        <div>
            <label className="label" htmlFor="u-set">
                Part of a set
            </label>
            <select
                id="u-set"
                className="field"
                value={value.mode === 'existing' ? (value.setId ?? '') : value.mode}
                onChange={(e) => {
                    const picked = e.target.value;
                    if (picked === '') onChange({ mode: '', newSetName: '' });
                    else if (picked === 'new')
                        onChange({ mode: 'new', newSetName: value.newSetName || suggestion });
                    else onChange({ mode: 'existing', setId: picked, newSetName: '' });
                }}
            >
                <option value="">Not part of a set</option>
                {matches.map((s) => (
                    <option key={s.id} value={s.id}>
                        {s.name}
                        {s.paper_count ? ` (${s.paper_count})` : ''}
                    </option>
                ))}
                <option value="new">+ Create a new set</option>
            </select>

            {value.mode === 'new' && (
                <input
                    className="field mt-2"
                    value={value.newSetName}
                    onChange={(e) => onChange({ ...value, newSetName: e.target.value })}
                    placeholder={suggestion}
                    aria-label="Name for the new set"
                />
            )}

            <p className="meta mt-1.5">
                {loading
                    ? 'Looking for existing sets…'
                    : value.mode === 'existing'
                      ? describeSet(matches.find((s) => s.id === value.setId) ?? ({} as ExamSetSummary)) ||
                        'This paper joins that sitting.'
                      : value.mode === 'new'
                        ? 'Later papers from the same school, exam type, term and year will join this set automatically.'
                        : matches.length > 0
                          ? `${matches.length} set${matches.length === 1 ? '' : 's'} from this school already.`
                          : 'Group this paper with the rest of the same sitting.'}
            </p>
        </div>
    );
}

function FilePicker({
    label,
    file,
    required,
    inputRef,
    onPick,
}: {
    label: string;
    file: File | null;
    required?: boolean;
    inputRef: React.RefObject<HTMLInputElement | null>;
    onPick: (file: File | null) => void;
}) {
    return (
        <div>
            <span className="label">{label}</span>
            <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            />

            {file ? (
                <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5">
                    <FileUp className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                    <span className="figure shrink-0 text-[11px] text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            onPick(null);
                            if (inputRef.current) inputRef.current.value = '';
                        }}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded hover:bg-secondary"
                        aria-label={`Remove ${file.name}`}
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 text-sm font-semibold text-muted-foreground transition-all duration-150 hover:border-primary hover:bg-primary/[0.03] hover:text-foreground"
                >
                    <FileUp className="h-4 w-4" />
                    Choose PDF{required ? '' : ' (optional)'}
                </button>
            )}
        </div>
    );
}
