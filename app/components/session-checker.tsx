"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLiveRefresh } from "@/app/lib/use-live-refresh";

const CHECK_INTERVAL_MS = 5000;

// Sends the browser to the login page as soon as its session ends: timed out, signed out on another tab,
// or ended by an administrator (account disabled, role changed, password reset). Checks while the tab is
// visible, and straight away when the user comes back to it.
export default function SessionChecker() {
    const router = useRouter();
    const pathname = usePathname();

    const check = useCallback(async () => {
        const response = await fetch("/api/auth/check", { cache: "no-store" });
        // A server or database problem is not a reason to sign anyone out: only an explicit "no"
        if (!response.ok) return;
        const data = await response.json();
        if (data.authenticated === false) {
            const next = `${window.location.pathname}${window.location.search}`;
            router.replace(next && next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login");
            router.refresh();
        }
    }, [router]);

    // Nothing to watch on the login page itself
    useLiveRefresh(check, CHECK_INTERVAL_MS, pathname !== "/login");

    return null;
}
