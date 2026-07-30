'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { BrandMark, Wordmark } from '@/components/shell/Wordmark';
import { AlertCircle, CheckCircle, Eye, EyeOff, Loader2, Lock, Mail, User } from 'lucide-react';

function SignupForm() {
    const searchParams = useSearchParams();
    const nextParam = searchParams.get('next');
    const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';

    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!fullName.trim()) {
            setError('Please enter your name');
            return;
        }
        if (password !== confirmPassword) {
            setError('The two passwords do not match');
            return;
        }
        if (password.length < 8) {
            setError('Use at least 8 characters for your password');
            return;
        }

        setIsLoading(true);
        try {
            const supabase = createClient();
            const { error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                    data: { full_name: fullName.trim() },
                },
            });

            if (signUpError) {
                setError(signUpError.message);
                return;
            }
            setSuccess(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (success) {
        return (
            <div className="text-center">
                <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-success/15">
                    <CheckCircle className="h-7 w-7 text-success" />
                </span>
                <h2 className="text-lg font-bold">Check your email</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                    We sent a confirmation link to <strong className="text-foreground">{email}</strong>. Open it to
                    finish setting up your account.
                </p>
                <Link
                    href={`/auth/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
                    className="btn-primary mt-6 w-full"
                >
                    Back to sign in
                </Link>
            </div>
        );
    }

    return (
        <form onSubmit={handleSignup} className="space-y-4">
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
                <label className="label" htmlFor="signup-name">
                    Your name
                </label>
                <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        id="signup-name"
                        type="text"
                        autoComplete="name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        placeholder="Jane Wanjiku"
                        className="field pl-9"
                    />
                </div>
            </div>

            <div>
                <label className="label" htmlFor="signup-email">
                    Email
                </label>
                <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        id="signup-email"
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
                <label className="label" htmlFor="signup-password">
                    Password
                </label>
                <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        id="signup-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="At least 8 characters"
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

            <div>
                <label className="label" htmlFor="signup-confirm">
                    Confirm password
                </label>
                <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        id="signup-confirm"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        placeholder="Type it again"
                        className="field pl-9"
                    />
                </div>
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isLoading ? 'Creating your account…' : 'Create account'}
            </button>

            <p className="pt-2 text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link
                    href={`/auth/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
                    className="font-semibold text-primary hover:underline"
                >
                    Sign in
                </Link>
            </p>
        </form>
    );
}

export default function SignupPage() {
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
                    <Suspense fallback={<div className="h-80 animate-pulse rounded-lg bg-secondary/60" />}>
                        <SignupForm />
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
