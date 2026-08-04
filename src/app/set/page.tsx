'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    AlertCircle,
    Download,
    FileUp,
    Layers,
    Loader2,
    Plus,
    Search,
    SlidersHorizontal,
    Sparkles,
    X,
} from 'lucide-react';
import TopNav from '@/components/shell/TopNav';
import BankFilters, { EMPTY_BANK_FILTERS, type BankFilterState } from '@/components/setter/BankFilters';
import BankRow from '@/components/setter/BankRow';
import PaperPanel, { type PaperMeta } from '@/components/setter/PaperPanel';
import AutoBuildModal from '@/components/setter/AutoBuildModal';
import ExamPreview from '@/components/ExamPreview';
import MarkingSchemePreview from '@/components/MarkingSchemePreview';
import PaperPdfButton from '@/components/PaperPdfButton';
import QuestionEntryModal from '@/components/QuestionEntryModal';
import EnhancedBulkImport from '@/components/EnhancedBulkImport';
import { assemblePaper, fetchQuestionPool, paperStats, totalMarks } from '@/services/paperBuilder';
import { bulkCreateQuestions, createQuestion, getGrades, getSubjects } from '@/services/questionService';
import { createExam } from '@/services/examService';
import { LEVELS, formatPrice } from '@/lib/catalog';
import { useRole } from '@/lib/roles';
import type { DBGrade, DBQuestion, DBSubject, ExamMetadata, ExamPaper, Question } from '@/types';
import type { PaperSource } from '@/services/paperLayout';
import type { PaperBlueprint } from '@/types/shop';

const DEFAULT_META: PaperMeta = {
    title: 'End of Term Examination',
    subject: '',
    examType: 'end-term',
    levelSlug: '',
    gradeLabel: '',
    termSlug: '',
    year: new Date().getFullYear(),
    duration: '2 Hours',
    institution: '',
    instructions: '1. Answer ALL questions in the spaces provided.\n2. Show all your working clearly.',
};

const PAGE_SIZE = 30;

/**
 * THE SETTER — build your own paper out of the question bank.
 *
 * Three panes: filter the bank, pick questions, watch the paper add up. The
 * selection rules live in services/paperBuilder so this page stays about the
 * interaction and nothing else.
 */
export default function SetterPage() {
    const router = useRouter();

    // Bank
    const [filters, setFilters] = useState<BankFilterState>(EMPTY_BANK_FILTERS);
    const [searchDraft, setSearchDraft] = useState('');
    const [pool, setPool] = useState<DBQuestion[]>([]);
    const [loadingPool, setLoadingPool] = useState(true);
    // Kept separate from "nothing matched": a bank that cannot be reached and a
    // bank with no matching questions look identical on screen but need opposite
    // responses from the person looking at it.
    const [poolError, setPoolError] = useState<string | null>(null);
    const [visible, setVisible] = useState(PAGE_SIZE);

    // Lookups
    const [grades, setGrades] = useState<DBGrade[]>([]);
    const [subjects, setSubjects] = useState<DBSubject[]>([]);

    // The paper
    const [selected, setSelected] = useState<DBQuestion[]>([]);
    const [meta, setMeta] = useState<PaperMeta>(DEFAULT_META);

    // UI
    const [showFiltersMobile, setShowFiltersMobile] = useState(false);
    const [showAutoBuild, setShowAutoBuild] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [previewMode, setPreviewMode] = useState<'paper' | 'scheme'>('paper');
    const [showNewQuestion, setShowNewQuestion] = useState(false);
    const [showBulkImport, setShowBulkImport] = useState(false);
    const [showPublish, setShowPublish] = useState(false);
    const [saving, setSaving] = useState(false);

    // Anyone can set and save a paper. Listing it for sale is an admin action,
    // so the publish button only appears for admins and the owner.
    const { isAdmin, signedIn: roleSignedIn, ready: roleReady } = useRole();
    const signedIn = roleReady ? roleSignedIn : null;

    useEffect(() => {
        // No rejection handler here previously: a failure left the filter
        // dropdowns permanently empty with nothing said about it.
        Promise.all([getGrades(), getSubjects()])
            .then(([g, s]) => {
                setGrades(g);
                setSubjects(s);
            })
            .catch((err) => {
                console.error('Could not load the setter lookups:', err);
            });
    }, []);

    // Debounce search into the filter state.
    useEffect(() => {
        const timer = setTimeout(() => {
            setFilters((f) => (f.search === searchDraft ? f : { ...f, search: searchDraft }));
        }, 300);
        return () => clearTimeout(timer);
    }, [searchDraft]);

    // Load the pool whenever the filters change. The whole matching set comes
    // back (paged internally) so auto-build has real choice.
    useEffect(() => {
        const level = LEVELS.find((l) => l.slug === filters.levelSlug);
        let cancelled = false;
        setLoadingPool(true);
        setPoolError(null);
        setVisible(PAGE_SIZE);

        fetchQuestionPool({
            grade_id: filters.gradeId || undefined,
            subject_id: filters.subjectId || undefined,
            level: level?.dbLevel,
            band: level?.dbBand,
            difficulty: (filters.difficulty || undefined) as DBQuestion['difficulty'] | undefined,
            type: (filters.type || undefined) as DBQuestion['type'] | undefined,
            search: filters.search || undefined,
        })
            .then((questions) => !cancelled && setPool(questions))
            .catch((err: unknown) => {
                if (cancelled) return;
                const message = err instanceof Error ? err.message : 'Could not load the question bank';
                setPool([]);
                setPoolError(message);
                toast.error('Could not load the question bank');
            })
            .finally(() => !cancelled && setLoadingPool(false));

        return () => {
            cancelled = true;
        };
    }, [filters.levelSlug, filters.gradeId, filters.subjectId, filters.difficulty, filters.type, filters.search]);

    // Topic counts come from the loaded pool, so they always agree with what is
    // actually on screen.
    const topicCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const q of pool) {
            const topic = q.topic || 'Untagged';
            counts.set(topic, (counts.get(topic) ?? 0) + 1);
        }
        return [...counts.entries()]
            .map(([topic, count]) => ({ topic, count }))
            .sort((a, b) => a.topic.localeCompare(b.topic));
    }, [pool]);

    // Topic checkboxes filter client-side — instant, no refetch.
    const filteredPool = useMemo(() => {
        if (filters.topics.length === 0) return pool;
        const wanted = new Set(filters.topics);
        return pool.filter((q) => wanted.has(q.topic || 'Untagged'));
    }, [pool, filters.topics]);

    const selectedIds = useMemo(() => new Set(selected.map((q) => q.id)), [selected]);

    // ------------------------------------------------------------------ actions

    const addQuestion = useCallback((question: DBQuestion) => {
        setSelected((current) => (current.some((q) => q.id === question.id) ? current : [...current, question]));
    }, []);

    const removeQuestion = useCallback((id: string) => {
        setSelected((current) => current.filter((q) => q.id !== id));
    }, []);

    const addAllVisible = () => {
        const additions = filteredPool.slice(0, visible).filter((q) => !selectedIds.has(q.id));
        if (additions.length === 0) {
            toast.info('Everything on screen is already in your paper');
            return;
        }
        setSelected((current) => [...current, ...additions]);
        toast.success(`Added ${additions.length} question${additions.length === 1 ? '' : 's'}`);
    };

    const moveQuestion = (index: number, direction: -1 | 1) => {
        setSelected((current) => {
            const next = [...current];
            const target = index + direction;
            if (target < 0 || target >= next.length) return current;
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const autoBuild = (blueprint: PaperBlueprint, mode: 'replace' | 'append') => {
        const existing = mode === 'append' ? selected : [];
        const result = assemblePaper(filteredPool, blueprint, existing);

        if (result.questions.length === 0) {
            toast.error(result.notes[0] || 'Nothing in the bank matches this blueprint');
            return;
        }

        setSelected(mode === 'append' ? [...existing, ...result.questions] : result.questions);
        setShowAutoBuild(false);

        const built = mode === 'append' ? totalMarks([...existing, ...result.questions]) : result.totalMarks;
        if (result.shortfallMarks > 0) {
            toast.warning(
                `Built ${built} of ${blueprint.targetMarks} marks. ${result.notes[result.notes.length - 1] ?? ''}`
            );
        } else {
            toast.success(`Built a ${built}-mark paper from ${result.questions.length} questions`);
        }
    };

    /**
     * The paper as the renderer sees it. The preview on screen and the PDF that
     * downloads are both drawn from this and from the questions themselves, so
     * what is approved here is what prints.
     */
    const paperSource: PaperSource = useMemo(
        () => ({
            title: meta.title,
            subject: meta.subject || selected[0]?.subject || '',
            grade_label: meta.gradeLabel,
            exam_type: meta.examType,
            term_slug: meta.termSlug,
            year: meta.year,
            time_limit: meta.duration,
            institution: meta.institution,
            total_marks: totalMarks(selected),
            instructions: meta.instructions,
        }),
        [meta, selected]
    );

    /** Something a teacher will recognise in their downloads folder. */
    const pdfFilename = (asset: 'paper' | 'scheme') => {
        const base = [meta.gradeLabel, meta.subject || selected[0]?.subject, meta.title, meta.year]
            .filter(Boolean)
            .join('-')
            .replace(/\s+/g, '-')
            .replace(/[^\w-]/g, '');
        return `${base || 'exam-paper'}${asset === 'scheme' ? '-marking-scheme' : ''}.pdf`.toLowerCase();
    };

    // Build the shape the preview and PDF components expect.
    const examPaper: ExamPaper = useMemo(() => {
        const metadata: ExamMetadata = {
            id: 'draft',
            title: meta.title,
            subject: meta.subject || selected[0]?.subject || 'Subject',
            code: '',
            timeLimit: meta.duration,
            totalMarks: totalMarks(selected),
            institution: meta.institution,
            instructions: meta.instructions,
            templateId: 'cbc',
            layoutConfig: { fontSize: 'text-base', fontFamily: 'serif' },
            logoPlacement: 'left',
            customFields: [],
            examBoard: 'knec',
            primaryColor: '#0f6b4f',
            accentColor: '#c2801a',
            grade: meta.gradeLabel,
        };
        return { metadata, questions: selected as Question[], updatedAt: Date.now() };
    }, [meta, selected]);

    const savePaper = async () => {
        if (signedIn === false) {
            router.push('/auth/login?next=/set');
            return;
        }
        setSaving(true);
        try {
            const saved = await createExam({
                title: meta.title,
                subject: examPaper.metadata.subject,
                grade_id: filters.gradeId || undefined,
                subject_id: filters.subjectId || undefined,
                total_marks: totalMarks(selected),
                time_limit: meta.duration,
                institution: meta.institution,
                exam_board: 'knec',
                question_ids: selected.map((q) => q.id),
                exam_type: meta.examType,
                level_slug: meta.levelSlug || undefined,
                grade_label: meta.gradeLabel || undefined,
                term_slug: meta.termSlug || undefined,
                year: meta.year,
            });

            if (!saved) {
                toast.error('Could not save the paper. Please try again.');
                return;
            }
            toast.success('Saved to your library');
        } finally {
            setSaving(false);
        }
    };

    const publishPaper = async (priceCents: number, description: string, hasScheme: boolean) => {
        if (signedIn === false) {
            router.push('/auth/login?next=/set');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/papers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: meta.title,
                    subject: examPaper.metadata.subject,
                    description,
                    // Printed under INSTRUCTIONS TO CANDIDATES on the PDF.
                    instructions: meta.instructions,
                    exam_type: meta.examType,
                    level_slug: meta.levelSlug || undefined,
                    grade_label: meta.gradeLabel || undefined,
                    term_slug: meta.termSlug || undefined,
                    year: meta.year,
                    grade_id: filters.gradeId || undefined,
                    subject_id: filters.subjectId || undefined,
                    total_marks: totalMarks(selected),
                    time_limit: meta.duration,
                    institution: meta.institution,
                    question_ids: selected.map((q) => q.id),
                    price_cents: priceCents,
                    has_marking_scheme: hasScheme,
                    is_published: true,
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || 'Could not publish the paper');
                return;
            }
            setShowPublish(false);
            toast.success(
                priceCents > 0
                    ? `Published at ${formatPrice(priceCents)} — it is now in the shop`
                    : 'Published as a free paper'
            );
            router.push(`/papers/${data.paper.slug || data.paper.id}`);
        } finally {
            setSaving(false);
        }
    };

    const stats = paperStats(selected);
    const schemeCount = selected.filter((q) => q.markingScheme).length;

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-background">
            <TopNav />

            <div className="grid flex-1 overflow-hidden lg:grid-cols-[260px_1fr_380px]">
                {/* Filters */}
                <aside className="hidden overflow-y-auto scroll-panel border-r border-border p-4 lg:block">
                    <BankFilters
                        filters={filters}
                        grades={grades}
                        subjects={subjects}
                        topicCounts={topicCounts}
                        onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
                        onReset={() => {
                            setFilters(EMPTY_BANK_FILTERS);
                            setSearchDraft('');
                        }}
                    />
                </aside>

                {/* Bank */}
                <main className="flex min-w-0 flex-col overflow-hidden">
                    <div className="border-b border-border p-3">
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    type="search"
                                    value={searchDraft}
                                    onChange={(e) => setSearchDraft(e.target.value)}
                                    placeholder="Search the question bank…"
                                    className="field pl-9"
                                    aria-label="Search questions"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowFiltersMobile(true)}
                                className="btn-outline lg:hidden"
                            >
                                <SlidersHorizontal className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            <p className="mr-auto text-xs text-muted-foreground">
                                {loadingPool
                                    ? 'Loading bank…'
                                    : `${filteredPool.length} question${filteredPool.length === 1 ? '' : 's'} · ${
                                          selected.length
                                      } in your paper`}
                            </p>
                            <button type="button" onClick={() => setShowNewQuestion(true)} className="btn-ghost btn-sm">
                                <Plus className="h-3.5 w-3.5" />
                                New question
                            </button>
                            <button type="button" onClick={() => setShowBulkImport(true)} className="btn-ghost btn-sm">
                                <FileUp className="h-3.5 w-3.5" />
                                Bulk import
                            </button>
                            <button
                                type="button"
                                onClick={addAllVisible}
                                disabled={filteredPool.length === 0}
                                className="btn-outline btn-sm"
                            >
                                <Layers className="h-3.5 w-3.5" />
                                Add all shown
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 scroll-panel space-y-2 p-3">
                        {loadingPool ? (
                            Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="skeleton h-20" />
                            ))
                        ) : poolError ? (
                            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                                <AlertCircle className="mb-3 h-8 w-8 text-destructive" />
                                <p className="title-2">The question bank could not be reached</p>
                                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                                    This is a connection problem, not an empty bank — your questions are safe.
                                </p>
                                <p className="mt-3 max-w-sm rounded-lg bg-secondary px-3 py-2 text-left font-mono text-xs text-muted-foreground">
                                    {poolError}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setFilters((f) => ({ ...f }))}
                                    className="btn-outline mt-5"
                                >
                                    Try again
                                </button>
                            </div>
                        ) : filteredPool.length === 0 ? (
                            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
                                <Sparkles className="mb-3 h-8 w-8 text-muted-foreground" />
                                <p className="title-2">No questions match these filters</p>
                                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                                    Widen the filters, or add questions to the bank — you can type them in or paste a
                                    whole paper with bulk import.
                                </p>
                                <div className="mt-5 flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowNewQuestion(true)}
                                        className="btn-primary"
                                    >
                                        <Plus className="h-4 w-4" />
                                        Add a question
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowBulkImport(true)}
                                        className="btn-outline"
                                    >
                                        <FileUp className="h-4 w-4" />
                                        Bulk import
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {filteredPool.slice(0, visible).map((question) => (
                                    <BankRow
                                        key={question.id}
                                        question={question}
                                        added={selectedIds.has(question.id)}
                                        onAdd={addQuestion}
                                        onRemove={removeQuestion}
                                    />
                                ))}

                                {visible < filteredPool.length && (
                                    <button
                                        type="button"
                                        onClick={() => setVisible((v) => v + PAGE_SIZE)}
                                        className="btn-outline w-full"
                                    >
                                        Show {Math.min(PAGE_SIZE, filteredPool.length - visible)} more of{' '}
                                        {filteredPool.length - visible}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </main>

                {/* Paper */}
                <aside className="hidden border-l border-border lg:block">
                    <PaperPanel
                        meta={meta}
                        questions={selected as Question[]}
                        saving={saving}
                        onMetaChange={(patch) => setMeta((m) => ({ ...m, ...patch }))}
                        onMove={moveQuestion}
                        onRemove={removeQuestion}
                        onClear={() => setSelected([])}
                        onPreview={() => {
                            setPreviewMode('paper');
                            setShowPreview(true);
                        }}
                        onSave={savePaper}
                        onOpenAutoBuild={() => setShowAutoBuild(true)}
                        onOpenPublish={() => setShowPublish(true)}
                        canPublish={isAdmin}
                    />
                </aside>
            </div>

            {/* Mobile paper summary bar */}
            <div className="flex items-center gap-3 border-t border-border bg-card p-3 lg:hidden">
                <div className="flex-1">
                    <p className="figure text-xs font-semibold">
                        {stats.count} question{stats.count === 1 ? '' : 's'} · {stats.marks} marks
                    </p>
                    <p className="figure text-[10px] text-muted-foreground">≈ {stats.estimatedMinutes} min</p>
                </div>
                <button type="button" onClick={() => setShowAutoBuild(true)} className="btn-outline btn-sm">
                    <Sparkles className="h-3.5 w-3.5" />
                    Auto-build
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setPreviewMode('paper');
                        setShowPreview(true);
                    }}
                    disabled={selected.length === 0}
                    className="btn-primary btn-sm"
                >
                    Review paper
                </button>
            </div>

            {/* ------------------------------------------------------------ modals */}

            {showFiltersMobile && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div className="absolute inset-0 bg-foreground/40" onClick={() => setShowFiltersMobile(false)} />
                    <div className="absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col bg-card">
                        <div className="flex items-center justify-between border-b border-border p-4">
                            <h2 className="title-2">Filter the bank</h2>
                            <button
                                type="button"
                                onClick={() => setShowFiltersMobile(false)}
                                className="btn-icon"
                                aria-label="Close"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="flex-1 scroll-panel p-4">
                            <BankFilters
                                filters={filters}
                                grades={grades}
                                subjects={subjects}
                                topicCounts={topicCounts}
                                onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
                                onReset={() => {
                                    setFilters(EMPTY_BANK_FILTERS);
                                    setSearchDraft('');
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            <AutoBuildModal
                open={showAutoBuild}
                poolSize={filteredPool.length}
                topics={topicCounts.map((t) => t.topic)}
                onClose={() => setShowAutoBuild(false)}
                onBuild={autoBuild}
            />

            {/* Preview + PDF */}
            {showPreview && (
                <div className="fixed inset-0 z-50 flex flex-col bg-foreground/60">
                    <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-3">
                        <div className="flex gap-1">
                            <button
                                type="button"
                                onClick={() => setPreviewMode('paper')}
                                className={previewMode === 'paper' ? 'chip chip-active' : 'chip'}
                            >
                                Question paper
                            </button>
                            <button
                                type="button"
                                onClick={() => setPreviewMode('scheme')}
                                className={previewMode === 'scheme' ? 'chip chip-active' : 'chip'}
                            >
                                Marking scheme
                                {schemeCount < selected.length && (
                                    <span className="text-[10px]">
                                        ({schemeCount}/{selected.length})
                                    </span>
                                )}
                            </button>
                        </div>

                        <div className="ml-auto flex items-center gap-2">
                            <PaperPdfButton
                                paper={paperSource}
                                questions={selected}
                                asset={previewMode === 'paper' ? 'paper' : 'scheme'}
                                filename={pdfFilename(previewMode === 'paper' ? 'paper' : 'scheme')}
                                className="btn-primary"
                            >
                                <Download className="h-4 w-4" />
                                Download PDF
                            </PaperPdfButton>
                            <button
                                type="button"
                                onClick={() => setShowPreview(false)}
                                className="btn-icon"
                                aria-label="Close preview"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 scroll-panel bg-muted/40 p-6">
                        <div className="mx-auto w-fit">
                            {previewMode === 'paper' ? (
                                <ExamPreview paper={paperSource} questions={selected} />
                            ) : (
                                <MarkingSchemePreview paper={paperSource} questions={selected} />
                            )}
                        </div>
                    </div>
                </div>
            )}

            <QuestionEntryModal
                isOpen={showNewQuestion}
                onClose={() => setShowNewQuestion(false)}
                onSave={async (question) => {
                    const saved = await createQuestion(question, {
                        grade_id: filters.gradeId || undefined,
                        subject_id: filters.subjectId || undefined,
                    });
                    if (!saved) {
                        toast.error('Could not save the question');
                        return;
                    }
                    setPool((current) => [saved, ...current]);
                    addQuestion(saved);
                    setShowNewQuestion(false);
                    toast.success('Question added to the bank and your paper');
                }}
            />

            <EnhancedBulkImport
                isOpen={showBulkImport}
                onClose={() => setShowBulkImport(false)}
                onImport={async (questions, isAiGenerated) => {
                    const created = await bulkCreateQuestions(
                        questions as unknown as Question[],
                        {
                            grade_id: filters.gradeId || undefined,
                            subject_id: filters.subjectId || undefined,
                        },
                        // Every row reaching here has already been reviewed and
                        // selected in the preview table — that is true whether
                        // it was typed, pasted or read off a document by AI.
                        // What differs is only the flag this stamps on the row,
                        // so the bank keeps an honest record of where each
                        // question actually came from.
                        isAiGenerated
                    );
                    if (created.length === 0) {
                        toast.error('Nothing was imported');
                        return;
                    }
                    setPool((current) => [...created, ...current]);
                    setShowBulkImport(false);
                    toast.success(`Imported ${created.length} questions into the bank`);
                }}
            />

            {showPublish && (
                <PublishModal
                    marks={stats.marks}
                    count={stats.count}
                    schemeCount={schemeCount}
                    saving={saving}
                    onClose={() => setShowPublish(false)}
                    onPublish={publishPaper}
                />
            )}
        </div>
    );
}

/** Set a price and put the paper in the shop. */
function PublishModal({
    marks,
    count,
    schemeCount,
    saving,
    onClose,
    onPublish,
}: {
    marks: number;
    count: number;
    schemeCount: number;
    saving: boolean;
    onClose: () => void;
    onPublish: (priceCents: number, description: string, hasScheme: boolean) => void;
}) {
    const [priceShillings, setPriceShillings] = useState(30);
    const [description, setDescription] = useState('');
    const [includeScheme, setIncludeScheme] = useState(schemeCount > 0);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <div className="absolute inset-0 bg-foreground/50" onClick={onClose} aria-hidden />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="publish-title"
                className="relative w-full max-w-md rounded-t-2xl bg-card p-5 shadow-2xl sm:rounded-2xl"
            >
                <h2 id="publish-title" className="title-1">
                    Publish &amp; sell
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    {count} questions · {marks} marks. Buyers get the PDF
                    {includeScheme ? ' and the marking scheme' : ''}.
                </p>

                <div className="mt-5 space-y-4">
                    <div>
                        <label className="label" htmlFor="publish-price">
                            Price (KES) — set 0 to give it away free
                        </label>
                        <input
                            id="publish-price"
                            type="number"
                            min={0}
                            step={10}
                            className="field"
                            value={priceShillings}
                            onChange={(e) => setPriceShillings(Math.max(0, Number(e.target.value) || 0))}
                        />
                        <p className="mt-1.5 text-xs text-muted-foreground">
                            {priceShillings === 0
                                ? 'Free papers still need a sign-in to download.'
                                : `Listed at ${formatPrice(priceShillings * 100)}. Comparable Kenyan sites charge KES 25–50 a paper.`}
                        </p>
                    </div>

                    <div>
                        <label className="label" htmlFor="publish-description">
                            What is in it? (optional)
                        </label>
                        <textarea
                            id="publish-description"
                            className="field min-h-20 resize-y"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Covers the whole Grade 8 Integrated Science term 2 syllabus, structured questions with a full marking scheme."
                        />
                    </div>

                    {schemeCount > 0 && (
                        <label className="flex items-start gap-2.5 text-sm">
                            <input
                                type="checkbox"
                                checked={includeScheme}
                                onChange={(e) => setIncludeScheme(e.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-input accent-[var(--primary)]"
                            />
                            <span>
                                Include the marking scheme
                                <span className="block text-xs text-muted-foreground">
                                    {schemeCount} of {count} questions have one written.
                                </span>
                            </span>
                        </label>
                    )}
                </div>

                <div className="mt-6 flex gap-2">
                    <button type="button" onClick={onClose} className="btn-outline flex-1">
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => onPublish(priceShillings * 100, description, includeScheme)}
                        disabled={saving}
                        className="btn-buy flex-1"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Publish
                    </button>
                </div>
            </div>
        </div>
    );
}
