import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
    return (
        <main className="page-wrapper">
            <div className="page-glow" />
            <div className="page-content flex min-h-[70vh] items-center justify-center px-4">
                <div className="glass-card max-w-lg rounded-2xl p-10 text-center">
                    <p className="text-5xl font-black text-slate-600">404</p>
                    <h1 className="mt-4 text-2xl font-extrabold text-white">Page not found</h1>
                    <p className="mt-3 text-sm text-slate-400">The address may be mistyped, or the page may have moved.</p>
                    <Link
                        href="/"
                        className="mt-8 inline-flex rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-bold text-white hover:from-blue-700 hover:to-indigo-700"
                    >
                        Go to the start page
                    </Link>
                </div>
            </div>
        </main>
    );
}
