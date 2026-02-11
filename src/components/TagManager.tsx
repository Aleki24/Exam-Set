'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Tag,
    Plus,
    X,
    Check,
    Loader2,
    Palette
} from 'lucide-react';
import { QuestionTag } from '@/types';
import {
    getTags,
    createTag,
    deleteTag,
    getQuestionTags,
    addTagToQuestion,
    removeTagFromQuestion
} from '@/services/tagService';

const TAG_COLORS = [
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e', '#ef4444', '#f97316',
    '#eab308', '#84cc16', '#22c55e', '#14b8a6',
    '#06b6d4', '#3b82f6', '#6b7280', '#78716c'
];

interface TagManagerProps {
    questionId?: string;
    onTagsChange?: (tags: QuestionTag[]) => void;
    compact?: boolean;
}

export default function TagManager({ questionId, onTagsChange, compact = false }: TagManagerProps) {
    const [allTags, setAllTags] = useState<QuestionTag[]>([]);
    const [questionTags, setQuestionTags] = useState<QuestionTag[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        loadTags();
    }, [questionId]);

    async function loadTags() {
        setLoading(true);
        const tags = await getTags();
        setAllTags(tags);

        if (questionId) {
            const qTags = await getQuestionTags(questionId);
            setQuestionTags(qTags);
        }

        setLoading(false);
    }

    async function handleCreateTag() {
        if (!newTagName.trim()) return;
        setCreating(true);

        const tag = await createTag(newTagName.trim(), newTagColor);
        if (tag) {
            setAllTags((prev) => [...prev, tag]);
            setNewTagName('');
            setShowCreate(false);
        }

        setCreating(false);
    }

    async function handleToggleTag(tag: QuestionTag) {
        if (!questionId) return;

        const isAssigned = questionTags.some((t) => t.id === tag.id);

        if (isAssigned) {
            const success = await removeTagFromQuestion(questionId, tag.id);
            if (success) {
                const updated = questionTags.filter((t) => t.id !== tag.id);
                setQuestionTags(updated);
                onTagsChange?.(updated);
            }
        } else {
            const success = await addTagToQuestion(questionId, tag.id);
            if (success) {
                const updated = [...questionTags, tag];
                setQuestionTags(updated);
                onTagsChange?.(updated);
            }
        }
    }

    async function handleDeleteTag(tagId: string) {
        const success = await deleteTag(tagId);
        if (success) {
            setAllTags((prev) => prev.filter((t) => t.id !== tagId));
            setQuestionTags((prev) => prev.filter((t) => t.id !== tagId));
        }
    }

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading tags...
            </div>
        );
    }

    if (compact) {
        return (
            <div className="flex flex-wrap gap-1.5">
                {questionTags.map((tag) => (
                    <span
                        key={tag.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: tag.color }}
                    >
                        {tag.name}
                    </span>
                ))}
                {questionTags.length === 0 && (
                    <span className="text-xs text-slate-400">No tags</span>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Tags
                </h4>
                <button
                    onClick={() => setShowCreate(!showCreate)}
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                    <Plus className="w-3 h-3" />
                    New Tag
                </button>
            </div>

            {/* Create new tag */}
            <AnimatePresence>
                {showCreate && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-3 bg-slate-50 rounded-lg space-y-2">
                            <input
                                type="text"
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                placeholder="Tag name..."
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                            />
                            <div className="flex flex-wrap gap-1.5">
                                {TAG_COLORS.map((color) => (
                                    <button
                                        key={color}
                                        onClick={() => setNewTagColor(color)}
                                        className={`w-6 h-6 rounded-full transition-transform ${newTagColor === color ? 'ring-2 ring-offset-1 ring-blue-500 scale-110' : ''
                                            }`}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleCreateTag}
                                    disabled={creating || !newTagName.trim()}
                                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                                </button>
                                <button
                                    onClick={() => setShowCreate(false)}
                                    className="px-3 py-1.5 text-slate-600 text-sm hover:bg-slate-200 rounded-lg"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Tags list */}
            <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => {
                    const isAssigned = questionTags.some((t) => t.id === tag.id);
                    return (
                        <button
                            key={tag.id}
                            onClick={() => questionId && handleToggleTag(tag)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-all ${isAssigned
                                    ? 'text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            style={isAssigned ? { backgroundColor: tag.color } : undefined}
                        >
                            {isAssigned && <Check className="w-3 h-3" />}
                            {tag.name}
                        </button>
                    );
                })}
                {allTags.length === 0 && (
                    <p className="text-sm text-slate-400">No tags created yet</p>
                )}
            </div>
        </div>
    );
}
