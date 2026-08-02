'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { friendlyAuthError } from '@/lib/authErrors';
import { BrandMark, Wordmark } from '@/components/shell/Wordmark';
import { AlertCircle, CheckCircle, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Only same-site paths are honoured, so a crafted ?next= cannot bounce
    // someone off to another host after they sign in.
    const nextParam = searchParams.get('next');
    const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    // A failed confirmation link redirects here with the reason attached, so the
    // page opens already showing what went wrong.
    const [error, setError] = useState<string | null>(searchParams.get('error'));
    // Set when the account exists but was never confirmed, which is a dead end
    // unless we offer a way out of it.
    const [needsConfirmation, setNeedsConfirmation] = useState(false);
    const [resent, setResent] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setNeedsConfirmation(false);
        setResent(false);
        setIsLoading(true);

        try {
            const supabase = createClient();
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

            if (signInError) {
                const unconfirmed = signInError.message.toLowerCase().includes('not confirmed');
                setNeedsConfirmation(unconfirmed);
                setError(friendlyAuthError(signInError.message));
                return;
            }

            router.push(next);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const resendConfirmation = async () => {
        setIsLoading(true);
        try {
            const supabase = createClient();
            const { error: resendError } = await supabase.auth.resend({
                type: 'signup',
                email,
                options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
            });
            if (resendError) {
                setError(friendlyAuthError(resendError.message));
                return;
            }
            setResent(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not send the email. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleLogin} className="space-y-4">
            {error && (
                <div
                    role="alert"
                    className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                >
                    <div className="flex items-start gap-2.5">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                    {needsConfirmation && !resent && (
                        <button
                            type="button"
                            onClick={resendConfirmation}
                            disabled={isLoading || !email}
                            className="mt-2.5 ml-6.5 font-semibold underline underline-offset-2 disabled:opacity-50"
                        >
                            Send the confirmation email again
                        </button>
                    )}
                </div>
            )}

            {resent && (
                <div
                    role="status"
                    className="flex items-start gap-2.5 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success"
                >
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        Sent. Open the link in <strong>{email}</strong> to finish setting up your account.
                    </span>
                </div>
            )}

            <div>
                <label className="label" htmlFor="login-email">
                    Email
                </label>
                <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        id="login-email"
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

            <div>
                <label className="label" htmlFor="login-password">
                    Password
                </label>
                <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="Your password"
                        className="field pl-9 pr-10"
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            <div className="flex justify-end">
                <Link
                    href={`/auth/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                    Forgot your password?
                </Link>
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isLoading ? 'Signing in…' : 'Sign in'}
            </button>

            <p className="pt-2 text-center text-sm text-muted-foreground">
                New here?{' '}
                <Link
                    href={`/auth/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
                    className="font-semibold text-primary hover:underline"
                >
                    Create an account
                </Link>
            </p>
        </form>
    );
}

export default function LoginPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
            <div className="w-full max-w-sm">
                <Link href="/" className="mb-8 flex flex-col items-center gap-3">
                    <BrandMark className="h-11 w-11 text-base" />
                    <span className="text-center">
                        <Wordmark
                            suffix="Exams"
                            className="block font-display text-lg font-bold tracking-[-0.02em]"
                        />
                        <span className="mt-1 block text-xs text-muted-foreground">
                            Buy CBE exam papers, or set your own
                        </span>
                    </span>
                </Link>

                <div className="surface p-6">
                    <h1 className="mb-5 text-lg font-bold">Sign in</h1>
                    <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-secondary/60" />}>
                        <LoginForm />
                    </Suspense>
                </div>

                <p className="mt-6 text-center">
                    <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
                        ← Back to the paper shop
                    </Link>
                </p>
            </div>
        </div>
    );
}
