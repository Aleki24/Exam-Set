'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { friendlyAuthError } from '@/lib/authErrors';
import { BrandMark, Wordmark } from '@/components/shell/Wordmark';
import { AlertCircle, Eye, EyeOff, Loader2, Lock } from 'lucide-react';

/**
 * SETTING A NEW PASSWORD
 *
 * Reached from a recovery link, which the callback has already exchanged for a
 * session. That session is the proof of identity — `updateUser` changes the
 * password of whoever is signed in, so this page must not be reachable without
 * one, or it would be a way to change a stranger's password.
 */
export default function ResetPasswordPage() {
    const router = useRouter();

    const [ready, setReady] = useState(false);
    const [hasSession, setHasSession] = useState(false);
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [show, setShow] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const check = async () => {
            try {
                const supabase = createClient();
                const { data } = await supabase.auth.getUser();
                if (!cancelled) {
                    setHasSession(Boolean(data.user));
                    setReady(true);
                }
            } catch {
                if (!cancelled) {
                    setHasSession(false);
                    setReady(true);
                }
            }
        };

        check();
        return () => {
            cancelled = true;
        };
    }, []);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 8) {
            setError('Use at least 8 characters.');
            return;
        }
        if (password !== confirm) {
            setError('The two passwords do not match.');
            return;
        }

        setIsLoading(true);
        try {
            const supabase = createClient();
            const { error: updateError } = await supabase.auth.updateUser({ password });

            if (updateError) {
                setError(friendlyAuthError(updateError.message));
                return;
            }

            // Signed in already as a side effect of the recovery link, so go
            // straight to the shop rather than asking them to sign in again.
            router.push('/');
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
            <div className="w-full max-w-sm">
                <Link href="/" className="mb-8 flex flex-col items-center gap-3">
                    <BrandMark className="h-11 w-11 text-base" />
                    <span className="text-center">
                        <Wordmark suffix="Exams" className="block font-display text-lg font-bold tracking-[-0.02em]" />
                    </span>
                </Link>

                <div className="surface p-6">
                    <h1 className="mb-5 text-lg font-bold">Choose a new password</h1>

                    {!ready ? (
                        <div className="h-48 animate-pulse rounded-lg bg-secondary/60" />
                    ) : !hasSession ? (
                        <div>
                            <div
                                role="alert"
                                className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                            >
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>
                                    This reset link is no longer valid. They expire an hour after being sent, and
                                    can only be used once.
                                </span>
                            </div>
                            <Link href="/auth/forgot-password" className="btn-primary mt-5 w-full">
                                Send a new link
                            </Link>
                        </div>
                    ) : (
                        <form onSubmit={submit} className="space-y-4">
                            {error && (
                                <div
                                    role="alert"
                                    className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                                >
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div>
                                <label className="label" htmlFor="new-password">
                                    New password
                                </label>
                                <div className="relative">
                                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        id="new-password"
                                        type={show ? 'text' : 'password'}
                                        autoComplete="new-password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        placeholder="At least 8 characters"
                                        className="field pl-9 pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShow((v) => !v)}
                                        className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                                        aria-label={show ? 'Hide password' : 'Show password'}
                                    >
                                        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="label" htmlFor="confirm-password">
                                    Confirm it
                                </label>
                                <div className="relative">
                                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        id="confirm-password"
                                        type={show ? 'text' : 'password'}
                                        autoComplete="new-password"
                                        value={confirm}
                                        onChange={(e) => setConfirm(e.target.value)}
                                        required
                                        placeholder="Type it again"
                                        className="field pl-9"
                                    />
                                </div>
                            </div>

                            <button type="submit" disabled={isLoading} className="btn-primary w-full">
                                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                {isLoading ? 'Saving…' : 'Save the new password'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
