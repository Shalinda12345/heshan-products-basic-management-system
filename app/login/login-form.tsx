"use client";

import { useActionState, useState } from "react";
import { handleLogin } from "@/app/login/actions";

export default function LoginForm({ next }: { next: string }) {
    // useActionState handles loading states and server returned errors smoothly
    const [state, formAction, isPending] = useActionState(handleLogin, null);
    const [showPassword, setShowPassword] = useState(false);

    const inputClass =
        "mt-1.5 block w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white placeholder-slate-500 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-900/40";

    return (
        <form action={formAction} className="space-y-5">
            <input type="hidden" name="next" value={next} />
            <div>
                <label htmlFor="username" className="block text-sm font-semibold text-slate-300">
                    Username
                </label>
                <input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    defaultValue={state?.username}
                    required
                    autoFocus
                    className={inputClass}
                    placeholder="Your username"
                />
            </div>

            <div>
                <label htmlFor="password" className="block text-sm font-semibold text-slate-300">
                    Password
                </label>
                <div className="relative">
                    <input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        className={`${inputClass} pr-20`}
                        placeholder="••••••••"
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword((show) => !show)}
                        className="absolute right-2 top-1/2 mt-[3px] -translate-y-1/2 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                        {showPassword ? "Hide" : "Show"}
                    </button>
                </div>
            </div>

            {state?.error && (
                <p className="rounded-xl border border-rose-800/50 bg-rose-950/40 px-4 py-3 text-sm font-medium text-rose-200" role="alert">
                    {state.error}
                </p>
            )}

            <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 px-4 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 cursor-pointer"
            >
                {isPending ? "Signing in..." : "Sign In"}
            </button>
        </form>
    );
}
