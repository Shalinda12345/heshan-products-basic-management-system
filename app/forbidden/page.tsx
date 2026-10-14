import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/app/lib/auth";
import { ROLE_INFO, homePathFor } from "@/app/lib/permissions";

export const metadata: Metadata = { title: "No access" };

export default async function ForbiddenPage() {
    const user = await getCurrentUser();
    return (
        <main className="page-wrapper">
            <div className="page-glow" />
            <div className="page-content flex min-h-[70vh] items-center justify-center px-4">
                <div className="glass-card max-w-lg rounded-2xl p-10 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15 text-3xl" aria-hidden>🔒</div>
                    <h1 className="mt-5 text-2xl font-extrabold text-white">You don&apos;t have access to that page</h1>
                    <p className="mt-3 text-sm text-slate-400">
                        {user
                            ? <>Your role ({ROLE_INFO[user.role].label}) doesn&apos;t include it. If you need it for your work, ask an administrator to change your role.</>
                            : <>Sign in with an account that has access.</>}
                    </p>
                    <Link
                        href={user ? homePathFor(user.role) : "/login"}
                        className="mt-8 inline-flex rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-bold text-white hover:from-blue-700 hover:to-indigo-700"
                    >
                        {user ? "Go to my start page" : "Sign in"}
                    </Link>
                </div>
            </div>
        </main>
    );
}
