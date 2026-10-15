import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/app/components/ui/feedback";

export const metadata: Metadata = { title: "Reports" };

// The report pages read their period from the address (useSearchParams), which needs a Suspense boundary
export default function ReportsLayout({ children }: { children: React.ReactNode }) {
    return <Suspense fallback={<Spinner />}>{children}</Suspense>;
}
