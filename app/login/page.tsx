// app/login/page.tsx
"use client";

import { useActionState } from "react";
import { handleLogin } from "@/app/login/actions";

export default function LoginPage() {
    // useActionState handles loading states and server returned errors smoothly
    const [state, formAction, isPending] = useActionState(handleLogin, null);

    return (
        <main className="page-wrapper">
            <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
                <div className="w-full max-w-md space-y-6 rounded-xl bg-white p-8 shadow-md">
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-gray-900">Welcome Back</h1>
                        <p className="mt-2 text-sm text-gray-600">Sign in to your account</p>
                    </div>

                    <form action={formAction} className="space-y-4">
                        <div>
                            <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                                Username
                            </label>
                            <input
                                id="username"
                                name="username"
                                type="username"
                                required
                                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Username"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                Password
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                required
                                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="••••••••"
                            />
                        </div>

                        {state?.error && (
                            <p className="text-sm text-red-600 font-medium" role="alert">
                                {state.error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={isPending}
                            className="w-full rounded-md bg-blue-600 py-2 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                            {isPending ? "Signing in..." : "Sign In"}
                        </button>
                    </form>
                </div>
            </div>
        </main>
    );
}
