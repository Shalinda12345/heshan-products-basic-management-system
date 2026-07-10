"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SessionChecker() {
    const router = useRouter();

    useEffect(() => {
        const interval = setInterval(async () => {
            const response = await fetch("/api/auth/check", {
                cache: "no-store",
            });

            const data = await response.json();

            if (!data.authenticated) {
                router.replace("/login");
                router.refresh();
            }
        }, 5000); // Check every 5 seconds

        return () => clearInterval(interval);
    }, [router]);

    return null;
}