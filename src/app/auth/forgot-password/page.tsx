'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { friendlyAuthError } from '@/lib/authErrors';
import { BrandMark, Wordmark } from '@/components/shell/Wordmark';
import { AlertCircle, CheckCircle, Loader2, Mail } from 'lucide-react';

/**
 * FORGOTTEN PASSWORD
 *
 * The app had no way to recover an account at all: no reset page, no
 * `resetPasswordForEmail` call anywhere, and nothing in the callback that
 * understood a recovery link. A forgotten password meant a permanently lost
 * account — including the owner's, who is the only person who can appoint
 * admins or price a paper.
 */
function ForgotPasswordForm() {
    const searchParams = useSearchParams();
    const [email, setEmail] = useState(searchParams.get('email') ?? '');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            const supabase = createClient();
            // The link lands on the callback, which exchanges the code for a
            // session and then forwards to the page that sets a new password.
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/auth/reset-password')}`,
            });

            if (resetError) {
                setError(friendlyAuthError(resetError.message));
                return;
            }

            // Shown whether or not the address exists. Confirming which emails
            // have accounts would turn this form into a way to enumerate the
            // platform's customers.
            setSent(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (sent) {
        return (
            <div className="text-center">
                <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-success/15">
                    <CheckCircle className="h-7 w-7 text-success" />
                </span>
                <h2 className="text-lg font-bold">Check your email</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                    If <strong className="text-foreground">{email}</strong> has an account, a link to set a new
                    password is on its way. It expires in one hour.
                </p>
                <p className="mt-4 rounded-lg bg-secondary/60 p-3 text-left text-xs text-muted-foreground">
                    Nothing arriving? Password emails need an email service to be configured on the project. Ask
                    the shop owner to reset it for you from the admin console instead.
                </p>
                <Link href="/auth/login" className="btn-primary mt-6 w-full">
                    Back to sign in
                </Link>
            </div>
        );
    }

    return (
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

            <p className="text-sm text-muted-foreground">
                Enter the email you signed up with and we will send a link to set a new password.
            </p>

            <div>
                <label className="label" htmlFor="reset-email">
                    Email
                </label>
                <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        id="reset-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder="you@school.ac.ke"
                        className="field pl-9"
                    />
                </div>
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isLoading ? 'Sending…' : 'Send the reset link'}
            </button>

            <p className="pt-2 text-center text-sm text-muted-foreground">
                Remembered it?{' '}
                <Link href="/auth/login" className="font-semibold text-primary hover:underline">
                    Sign in
                </Link>
            </p>
        </form>
    );
}

export default function ForgotPasswordPage() {
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
                    <h1 className="mb-5 text-lg font-bold">Reset your password</h1>
                    <Suspense fallback={<div className="h-56 animate-pulse rounded-lg bg-secondary/60" />}>
                        <ForgotPasswordForm />
                    </Suspense>
                </div>
            </div>
        </div>
    );
}
