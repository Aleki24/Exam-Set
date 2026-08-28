'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Check, FileUp, Layers, Loader2, Lock, RotateCcw, Sparkles, Upload, X } from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import { useRole } from '@/lib/roles';
import { EXAM_TYPES, EXAM_TYPE_GROUPS, LEVELS, TERMS, catalogYears, formatPrice } from '@/lib/catalog';
import { canSuggestSet, describeSet, suggestSetName, type ExamSetSummary, type SetFields } from '@/lib/examSets';
import { RESOURCE_KINDS } from '@/lib/resources';
import {
    PAPER_FILE_ACCEPT,
    PAPER_FORMAT_HINT,
    resolvePaperFormat,
    titleFromFilename,
} from '@/lib/uploadFormats';

/**
 * Which sitting the paper being uploaded belongs to.
 *
 *   ''            not part of a set — the default
 *   '<uuid>'      an existing set the uploader picked
 *   'new'         create one, named `newSetName`
 */
type SetChoice = { mode: '' | 'new' | 'existing'; setId?: string; newSetName: string };

/** What the bucket and both upload routes enforce. Checked here so a 20-minute
 * upload on a Kenyan mobile connection is not how somebody finds out. */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Upload a paper for sale. Admin and owner only — this is how the shop gets
 * stocked with past papers, county mocks and school exams.
 */
type SlotKind = 'paper' | 'scheme';

/**
 * One file's whole journey, which the page now shows instead of hiding.
 *
 *   empty      nothing chosen
 *   uploading  bytes are crossing, `progress` is real
 *   reading    in the bucket; the classifier is reading its cover
 *   ready      stored, and `key` is what the listing will point at
 *   failed     say what went wrong and let them try again
 */
type SlotStatus = 'empty' | 'uploading' | 'reading' | 'ready' | 'failed';

interface Slot {
    file: File | null;
    /** Where it landed. Null until the upload finishes. */
    key: string | null;
    /** 0–1, from the browser's own count of bytes sent. */
    progress: number;
    status: SlotStatus;
    error?: string;
}

const EMPTY_SLOT: Slot = { file: null, key: null, progress: 0, status: 'empty' };

/**
 * PUT the bytes, and report how many have gone.
 *
 * `fetch` cannot do this. It takes the whole Blob and tells you nothing until
 * it is done, which for a 25 MB scan on a Kenyan mobile connection is several
 * minutes of a spinner that could equally mean the app has died — and the most
 * common response to that is to press the button again. XHR is the only API in
 * the browser that reports upload progress, so this one call stays on it.
 */
function putWithProgress(
    ticket: { url: string; method?: string; headers?: Record<string, string> },
    file: File,
    onProgress: (fraction: number) => void,
    register: (xhr: XMLHttpRequest) => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        register(xhr);
        xhr.open(ticket.method || 'PUT', ticket.url);
        for (const [name, value] of Object.entries(ticket.headers ?? {})) {
            xhr.setRequestHeader(name, value);
        }
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(e.loaded / e.total);
        };
        xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
                ? resolve()
                : reject(new Error(`storage answered ${xhr.status}`));
        xhr.onerror = () => reject(new Error('the connection dropped'));
        xhr.onabort = () => reject(new DOMException('Upload replaced', 'AbortError'));
        xhr.send(file);
    });
}

/**
 * Upload a paper for sale. Admin and owner only — this is how the shop gets
 * stocked with past papers, county mocks and school exams.
 *
 * WHY THE FILE GOES UP THE MOMENT IT IS CHOSEN
 *
 * This page used to collect fourteen fields and then, on submit, upload the
 * file — so the slowest step in the process sat behind the most tedious one,
 * and a dropped connection at the end lost both. Worse, every one of those
 * fourteen fields is printed on the paper's own cover, and the bulk page has
 * been reading covers with a model since it shipped. A person listing one paper
 * typed by hand what a person listing sixty got for free.
 *
 * So the order is inverted. The file uploads as soon as it is picked, with a
 * real progress bar; the same classifier the bulk page uses then reads the
 * cover and fills the form in; and the uploader's job becomes checking a filled
 * form rather than composing an empty one. Submitting is a small JSON POST that
 * returns immediately, because the bytes are already in the bucket.
 *
 * Nothing here depends on the model being available or right. A failed or
 * unconfigured classifier leaves the form exactly as it was — empty and
 * fillable — and every field it does fill stays editable, because a cover read
 * wrongly must cost one correction, not a mislabelled paper in a live shop.
 */
export default function UploadPaperPage() {
    const router = useRouter();
    const { isAdmin, ready, signedIn, staleSession } = useRole();

    const paperInput = useRef<HTMLInputElement>(null);
    const schemeInput = useRef<HTMLInputElement>(null);

    const [paper, setPaper] = useState<Slot>(EMPTY_SLOT);
    const [scheme, setScheme] = useState<Slot>(EMPTY_SLOT);
    const [publishing, setPublishing] = useState(false);

    /*
     * The upload in flight for each slot, so replacing a file cancels the one
     * it replaced. Without this, picking a second paper while the first is
     * still going leaves two uploads racing to write the same slot, and the
     * loser can land last and point the listing at the file nobody chose.
     */
    const inFlight = useRef<Record<SlotKind, XMLHttpRequest | null>>({ paper: null, scheme: null });

    const [form, setForm] = useState({
        title: '',
        subject: '',
        description: '',
        exam_type: 'end-term',
        resource_kind: 'past-paper',
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

    /*
     * Which fields a person has touched.
     *
     * Half of this form carries a sensible default rather than a blank — the
     * level, the exam type, this year — so "is it empty?" cannot tell a default
     * apart from a decision. The cover fills anything untouched and overwrites
     * nothing typed, which is the only rule that is right in both directions:
     * a model reading "Grade 4" must beat the default of Junior School, and
     * must never beat a person who has already chosen.
     */
    const touched = useRef(new Set<string>());

    const [setChoice, setSetChoice] = useState<SetChoice>({ mode: '', newSetName: '' });

    useEffect(() => {
        if (ready && !signedIn) router.push('/auth/login?next=/papers/new');
    }, [ready, signedIn, router]);

    const set = (patch: Partial<typeof form>) => {
        for (const field of Object.keys(patch)) touched.current.add(field);
        setForm((f) => ({ ...f, ...patch }));
    };

    /** What the classifier read, into any field nobody has decided for themselves. */
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const applyCover = (read: any) => {
        setForm((f) => {
            const next = { ...f };
            const fill = (field: keyof typeof next, value: unknown) => {
                if (value === null || value === undefined || value === '') return;
                if (touched.current.has(field)) return;
                /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                (next as any)[field] = value;
            };

            fill('title', typeof read.title === 'string' ? read.title.slice(0, 255) : '');
            fill('subject', read.subject);
            fill('level_slug', read.level_slug);
            fill('grade_label', read.grade_label);
            fill('exam_type', read.exam_type);
            fill('resource_kind', read.resource_kind);
            fill('term_slug', read.term_slug);
            fill('year', read.year);
            fill('paper_number', read.paper_number);
            fill('total_marks', read.total_marks ? String(read.total_marks) : '');
            fill('time_limit', read.time_limit);
            fill('institution', read.institution);

            return next;
        });
    };

    /**
     * Ask the classifier what this file is, and fill the form in with the answer.
     *
     * The same route the bulk page calls, on one key. Every failure here is
     * silent by design: AI unconfigured, a scan it could not read, a network
     * that went away. None of those is a reason to stop somebody listing a
     * paper by hand, and an error toast for a convenience nobody asked for is
     * noise on top of a form that still works.
     */
    const readCover = async (key: string, file: File) => {
        setPaper((s) => (s.file === file ? { ...s, status: 'reading' } : s));
        try {
            const res = await fetch('/api/papers/bulk/classify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: [{ key, filename: file.name }] }),
            });
            const data = await res.json();
            const read = data?.classifications?.[0];

            if (res.ok && read?.ok) {
                applyCover(read);
                // Worth saying out loud: the two files are not interchangeable,
                // and a scheme listed as the question paper sells the answers.
                if (read.is_marking_scheme) {
                    toast('That reads like a marking scheme — check it is in the right slot.');
                } else {
                    toast.success('Read the cover — check the details below.');
                }
            }
        } catch {
            // The form is still fillable by hand. Nothing to say.
        } finally {
            setPaper((s) => (s.file === file ? { ...s, status: 'ready' } : s));
        }
    };

    /**
     * Everything that happens when a file is chosen, wherever it came from.
     *
     * Format and size are checked before anything leaves the machine. Both are
     * refused later anyway — by the ticket route, and by the bucket after that
     * — but "later" for the size means after the bytes have crossed a mobile
     * connection, which is the one failure worth spending a millisecond to
     * prevent.
     */
    const choose = (kind: SlotKind) => async (file: File | null) => {
        const label = kind === 'paper' ? 'question paper' : 'marking scheme';
        const store = kind === 'paper' ? setPaper : setScheme;

        inFlight.current[kind]?.abort();
        inFlight.current[kind] = null;

        if (!file) {
            store(EMPTY_SLOT);
            return;
        }
        if (!resolvePaperFormat(file)) {
            toast.error(`The ${label} must be a ${PAPER_FORMAT_HINT} file`);
            return;
        }
        if (file.size > MAX_BYTES) {
            toast.error(`That ${label} is ${(file.size / 1024 / 1024).toFixed(0)} MB — the limit is 25 MB`);
            return;
        }

        store({ file, key: null, progress: 0, status: 'uploading' });

        // A first guess at the title, instantly, from the filename alone. The
        // cover read will improve on it; this costs nothing and is right often
        // enough to matter if the classifier is not configured at all.
        if (kind === 'paper' && !touched.current.has('title')) {
            const suggested = titleFromFilename(file.name);
            if (suggested) setForm((f) => (f.title.trim() ? f : { ...f, title: suggested }));
        }

        try {
            const signRes = await fetch('/api/papers/upload/sign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stem: file.name.replace(/\.[a-z0-9]+$/i, ''),
                    /*
                     * The filename travels with the content type because on a
                     * good number of devices the type alone is worthless:
                     * Android's picker and Windows without Office both report a
                     * .docx as `application/octet-stream`. The server resolves
                     * the pair with the same module this page does, so the two
                     * never disagree about what was picked.
                     */
                    files: [{ kind, filename: file.name, contentType: file.type, size: file.size }],
                }),
            });
            const signed = await signRes.json();
            if (!signRes.ok) throw new Error(signed.error || 'Could not start the upload');

            const ticket = signed.tickets?.[0];
            if (!ticket) throw new Error('The upload was not authorised');

            await putWithProgress(
                ticket,
                file,
                (fraction) => store((s) => (s.file === file ? { ...s, progress: fraction } : s)),
                (xhr) => {
                    inFlight.current[kind] = xhr;
                }
            );
            inFlight.current[kind] = null;

            store((s) => (s.file === file ? { ...s, key: ticket.key, progress: 1, status: 'ready' } : s));
            if (kind === 'paper') await readCover(ticket.key, file);
        } catch (err) {
            // A replaced upload is not a failure — the slot already belongs to
            // whatever was picked instead.
            if (err instanceof DOMException && err.name === 'AbortError') return;

            const message = err instanceof Error ? err.message : 'Upload failed';
            store((s) => (s.file === file ? { ...s, status: 'failed', error: message } : s));
            toast.error(`Could not upload the ${label} — ${message}`);
        }
    };

    /** True while either file is still moving, which is the only thing the
     *  submit button ever has to wait for now. */
    const busy =
        paper.status === 'uploading' ||
        paper.status === 'reading' ||
        scheme.status === 'uploading' ||
        scheme.status === 'reading';

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (paper.status !== 'ready' || !paper.key) {
            toast.error(
                paper.status === 'uploading' || paper.status === 'reading'
                    ? 'The question paper is still uploading'
                    : `Attach the question paper — ${PAPER_FORMAT_HINT}`
            );
            return;
        }
        if (scheme.file && scheme.status !== 'ready') {
            toast.error('The marking scheme has not finished uploading');
            return;
        }
        if (!form.title.trim() || !form.subject.trim()) {
            toast.error('A title and subject are required');
            return;
        }

        setPublishing(true);
        try {
            const meta = {
                ...form,
                total_marks: form.total_marks ? Number(form.total_marks) : 0,
                question_count: form.question_count ? Number(form.question_count) : 0,
                price_cents: Math.round(form.price * 100),
                // Exactly one of these, so the server never has to guess
                // whether an id and a name disagree on purpose.
                set_id: setChoice.mode === 'existing' ? setChoice.setId : undefined,
                new_set: setChoice.mode === 'new' ? setChoice.newSetName.trim() || true : undefined,
            };

            // Both files are already in the bucket, so this is a small JSON
            // POST that returns at once — the wait happened where the person
            // could see it, next to the file it belonged to.
            const res = await fetch('/api/papers/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    meta,
                    pdf_storage_key: paper.key,
                    marking_scheme_storage_key: scheme.key,
                }),
            });
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
            toast.error('Could not list the paper. Check your connection and try again.');
        } finally {
            setPublishing(false);
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
                        <Link href="/catalog" className="btn-outline">
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
                    Drop the file and the cover is read for you. Check what it found, set a price, publish.
                </p>

                <Link
                    href="/papers/bulk"
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                    <Layers className="h-4 w-4" aria-hidden />
                    Uploading a folder? Drop the whole stack instead
                </Link>

                <form onSubmit={submit} className="mt-8 space-y-8 pb-4">
                    {/* Files — the whole point of the page, and now sized like it.
                        The question paper gets a target you cannot miss; the
                        marking scheme is a quieter row beneath it, because it is
                        genuinely optional and two identical boxes said otherwise. */}
                    <section className="surface p-5">
                        <div className="rule-heading">
                            <h2 className="overline">Files</h2>
                        </div>

                        <div className="mt-4 space-y-3">
                            <FileSlot
                                kind="paper"
                                label="Question paper"
                                prominent
                                slot={paper}
                                inputRef={paperInput}
                                onPick={choose('paper')}
                            />
                            <FileSlot
                                kind="scheme"
                                label="Marking scheme"
                                slot={scheme}
                                inputRef={schemeInput}
                                onPick={choose('scheme')}
                            />
                        </div>

                        <p className="meta mt-3">
                            {PAPER_FORMAT_HINT}, up to 25 MB. Word stays editable for the buyer — what a teacher
                            wants from a scheme of work. Papers with a marking scheme sell noticeably better.
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
                                    Title <span className="text-accent">*</span>
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

                            {/* Two, then three, then three. Every row fills — a
                                lone control beside an empty cell reads as a
                                field somebody forgot to add. */}
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="label" htmlFor="u-subject">
                                        Subject / learning area <span className="text-accent">*</span>
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
                                    <label className="label" htmlFor="u-kind">
                                        Kind of resource
                                    </label>
                                    <select
                                        id="u-kind"
                                        className="field"
                                        value={form.resource_kind}
                                        onChange={(e) => set({ resource_kind: e.target.value })}
                                    >
                                        {RESOURCE_KINDS.map((k) => (
                                            <option key={k.slug} value={k.slug}>
                                                {k.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-3">
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
                            </div>

                            <div className="grid gap-4 sm:grid-cols-3">
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
                            </div>

                            <div className="grid gap-4 sm:grid-cols-3">
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
                                    {/* The form has carried a `question_count`
                                        since it was written and never had a
                                        field for it, so every uploaded paper
                                        listed as having none — while the shop
                                        card has a line ready to print it. */}
                                    <label className="label" htmlFor="u-questions">
                                        Questions
                                    </label>
                                    <input
                                        id="u-questions"
                                        type="number"
                                        min={0}
                                        className="field"
                                        value={form.question_count}
                                        onChange={(e) => set({ question_count: e.target.value })}
                                        placeholder="24"
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

                    {/* Sticky, because this form is two screens long and the
                        action used to be below all of it — so the state of the
                        upload and the button that depends on it were never
                        visible at the same time. */}
                    <div className="sticky bottom-4 z-10 flex items-center gap-2 rounded-[var(--radius)] border border-border bg-background/90 p-2 shadow-sm backdrop-blur">
                        <Link href="/admin" className="btn-outline">
                            Cancel
                        </Link>
                        <button
                            type="submit"
                            disabled={publishing || busy || paper.status !== 'ready'}
                            className="btn-buy flex-1"
                        >
                            {publishing || busy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Upload className="h-4 w-4" />
                            )}
                            {publishing
                                ? 'Listing…'
                                : busy
                                  ? 'Waiting for the upload…'
                                  : paper.status !== 'ready'
                                    ? 'Attach the question paper'
                                    : form.is_published
                                      ? 'Publish to the shop'
                                      : 'Save as draft'}
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

/**
 * One file, from the moment it is chosen to the moment it is stored.
 *
 * This replaced a button that said "Choose PDF" and then went quiet for as long
 * as the upload took. Three things were wrong with that, and all three are the
 * same thing: the page knew what was happening and did not say. It knew the
 * bytes were moving and showed no progress. It knew the cover was being read
 * and showed no sign of it. It knew when a file had failed and reported it in a
 * toast that had already faded by the time anyone looked.
 *
 * So the slot renders its own state. `onPick` still does the validating — see
 * `choose` — so exactly one place decides what is acceptable.
 *
 * `prominent` is for the question paper: it is required, it is the reason the
 * page exists, and giving it the same 200px box as the optional marking scheme
 * said the opposite.
 */
function FileSlot({
    kind,
    label,
    slot,
    inputRef,
    onPick,
    prominent = false,
}: {
    kind: SlotKind;
    label: string;
    slot: Slot;
    inputRef: React.RefObject<HTMLInputElement | null>;
    onPick: (file: File | null) => void;
    prominent?: boolean;
}) {
    const [dragging, setDragging] = useState(false);
    const format = slot.file ? resolvePaperFormat(slot.file) : null;
    const percent = Math.round(slot.progress * 100);

    const open = () => inputRef.current?.click();
    const clear = () => {
        onPick(null);
        if (inputRef.current) inputRef.current.value = '';
    };

    const input = (
        <input
            ref={inputRef}
            type="file"
            accept={PAPER_FILE_ACCEPT}
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
    );

    // Nothing chosen: a target, sized by how much this file matters.
    if (slot.status === 'empty') {
        return (
            <div>
                {input}
                <button
                    type="button"
                    onClick={open}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setDragging(false);
                        onPick(e.dataTransfer.files?.[0] ?? null);
                    }}
                    className={`w-full rounded-[var(--radius)] border-2 border-dashed transition-colors ${
                        prominent
                            ? 'flex flex-col items-center justify-center gap-1.5 px-4 py-12 text-center'
                            : 'flex items-center gap-2.5 px-4 py-3 text-left'
                    } ${
                        dragging
                            ? 'border-primary bg-primary/[0.05]'
                            : 'border-border hover:border-primary/50 hover:bg-primary/[0.02]'
                    }`}
                >
                    <FileUp
                        className={`${prominent ? 'h-8 w-8' : 'h-4 w-4'} shrink-0 text-muted-foreground`}
                        aria-hidden
                    />
                    <span className={prominent ? 'title-3' : 'text-sm font-semibold'}>
                        {dragging ? 'Drop it here' : `Choose or drop the ${label.toLowerCase()}`}
                    </span>
                    <span className={prominent ? 'meta' : 'meta ml-auto hidden sm:block'}>
                        {kind === 'paper'
                            ? 'Its cover is read for you — PDF or Word, up to 25 MB'
                            : 'Optional'}
                    </span>
                </button>
            </div>
        );
    }

    // Chosen: one row that says where the file has got to.
    return (
        <div
            className={`rounded-[var(--radius)] border px-3 py-2.5 ${
                slot.status === 'failed' ? 'border-destructive/40 bg-destructive/5' : 'border-primary/40 bg-primary/5'
            }`}
        >
            {input}
            <div className="flex items-center gap-2">
                {slot.status === 'failed' ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
                ) : slot.status === 'ready' ? (
                    <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
                ) : (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
                )}

                <span className="min-w-0 flex-1 truncate text-sm font-medium">{slot.file?.name}</span>

                {format && slot.status === 'ready' && (
                    <span className="badge-soft shrink-0 text-[10px] uppercase">{format.label}</span>
                )}
                {slot.file && (
                    <span className="figure shrink-0 text-[11px] text-muted-foreground">
                        {(slot.file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                )}

                {slot.status === 'failed' ? (
                    <button
                        type="button"
                        onClick={open}
                        className="btn-ghost btn-sm shrink-0"
                        aria-label={`Choose another ${label.toLowerCase()}`}
                    >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        Try again
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={clear}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded hover:bg-secondary"
                        aria-label={`Remove ${slot.file?.name ?? label}`}
                    >
                        <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                )}
            </div>

            {/* The bar is the whole reason this is not a spinner. A 25 MB scan
                on a Kenyan mobile connection is minutes, and minutes of a
                spinner reads as a dead page — which gets the button pressed
                again, and the file uploaded twice. */}
            {slot.status === 'uploading' && (
                <div className="mt-2.5">
                    <div
                        className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
                        role="progressbar"
                        aria-valuenow={percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Uploading the ${label.toLowerCase()}`}
                    >
                        <div
                            className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-200"
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                    <p className="meta mt-1.5">Uploading — {percent}%</p>
                </div>
            )}

            {slot.status === 'reading' && (
                <p className="meta mt-2 inline-flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-primary" aria-hidden />
                    Reading the cover…
                </p>
            )}

            {slot.status === 'failed' && <p className="meta mt-2 text-destructive">{slot.error}</p>}
        </div>
    );
}
