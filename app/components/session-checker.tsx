"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function SessionChecker() {
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // Nothing to watch on the login page itself
        if (pathname === "/login") return;

        const interval = setInterval(async () => {
            try {
                const response = await fetch("/api/auth/check", {
                    cache: "no-store",
                });

                const data = await response.json();

                if (!data.authenticated) {
                    router.replace("/login");
                    router.refresh();
                }
            } catch {
                // Network hiccup: try again on the next tick
            }
        }, 5000); // Check every 5 seconds

        return () => clearInterval(interval);
    }, [router, pathname]);

    return null;
}
