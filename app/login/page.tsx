import type { Metadata } from "next";
import Image from "next/image";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
    const { next } = await searchParams;
    return (
        <main className="page-wrapper">
            <div className="page-glow" />
            <div className="page-content flex min-h-screen items-center justify-center px-4 py-12">
                <div className="w-full max-w-md">
                    <div className="mb-8 flex flex-col items-center text-center">
                        <Image src="/logo/heshan_logo_transparent.png" alt="Heshan Products" width={96} height={96} priority />
                        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-white">Sign in to Heshan Products</h1>
                        <p className="mt-2 text-sm text-slate-400">Sales, expenses, stock and reports in one place.</p>
                    </div>
                    <div className="glass-card rounded-2xl p-8 shadow-2xl shadow-black/40">
                        <LoginForm next={typeof next === "string" ? next : ""} />
                    </div>
                    <p className="mt-6 text-center text-xs text-slate-500">
                        Forgotten your password? Ask an administrator to reset it.
                    </p>
                </div>
            </div>
        </main>
    );
}
