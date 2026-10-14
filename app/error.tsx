'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';

// Shown instead of a blank screen when a page fails unexpectedly; the details go to the browser console
export default function PageError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <main className="page-wrapper">
            <div className="page-glow" />
            <div className="page-content flex min-h-[70vh] items-center justify-center px-4">
                <div className="glass-card max-w-lg rounded-2xl p-10 text-center" role="alert">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/15 text-3xl" aria-hidden>⚠️</div>
                    <h1 className="mt-5 text-2xl font-extrabold text-white">Something went wrong on this page</h1>
                    <p className="mt-3 text-sm text-slate-400">
                        Try again. If it keeps happening, note the time and what you were doing, and tell the administrator.
                    </p>
                    {error.digest && <p className="mt-2 font-mono text-xs text-slate-500">Reference: {error.digest}</p>}
                    <button
                        type="button"
                        onClick={() => unstable_retry()}
                        className="mt-8 inline-flex rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-bold text-white hover:from-blue-700 hover:to-indigo-700 cursor-pointer"
                    >
                        Try again
                    </button>
                </div>
            </div>
        </main>
    );
}
