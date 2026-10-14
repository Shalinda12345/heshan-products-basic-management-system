"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const CHECK_INTERVAL_MS = 5000;

// Sends the browser to the login page as soon as its session ends: timed out, signed out on another tab,
// or ended by an administrator (account disabled, role changed, password reset).
export default function SessionChecker() {
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // Nothing to watch on the login page itself
        if (pathname === "/login") return;

        let stopped = false;
        const check = async () => {
            try {
                const response = await fetch("/api/auth/check", {
                    cache: "no-store",
                });
                // A server or database problem is not a reason to sign anyone out: only an explicit "no"
                if (!response.ok) return;
                const data = await response.json();

                if (!stopped && data.authenticated === false) {
                    stopped = true;
                    const next = `${window.location.pathname}${window.location.search}`;
                    router.replace(next && next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login");
                    router.refresh();
                }
            } catch {
                // Network hiccup: try again on the next tick
            }
        };

        check();
        const interval = setInterval(check, CHECK_INTERVAL_MS);

        return () => {
            stopped = true;
            clearInterval(interval);
        };
    }, [router, pathname]);

    return null;
}
