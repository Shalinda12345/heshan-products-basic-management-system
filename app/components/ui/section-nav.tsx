'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePermissions } from '@/app/components/auth/user-provider';
import { canOpenPage } from '@/app/lib/permissions';

// A tab is shown only to users whose role can open its page (the same rules the proxy applies)
export interface SectionTab {
    href: string;
    label: string;
    icon?: string;
}

const ACCENTS = {
    blue: 'bg-blue-600 text-white shadow-md shadow-blue-500/20',
    rose: 'bg-rose-600 text-white shadow-md shadow-rose-500/20',
    violet: 'bg-violet-600 text-white shadow-md shadow-violet-500/20',
    emerald: 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20',
} as const;

// The sticky tab row under the main navigation (Sales, Expenses, Reports, Manage)
// `query` is kept on every tab link (e.g. the report period)
export default function SectionNav({ tabs, accent = 'blue', label, query }: { tabs: SectionTab[]; accent?: keyof typeof ACCENTS; label: string; query?: string }) {
    const pathname = usePathname();
    const { user } = usePermissions();
    const visible = tabs.filter((tab) => canOpenPage(user?.role, tab.href));
    if (visible.length <= 1) return null;

    return (
        <div className="sticky top-[84px] z-30 w-full bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <nav className="flex items-center gap-1 py-2 overflow-x-auto" aria-label={label}>
                    {visible.map((tab) => {
                        const isActive = pathname === tab.href;
                        return (
                            <Link
                                key={tab.href}
                                href={query ? `${tab.href}?${query}` : tab.href}
                                aria-current={isActive ? 'page' : undefined}
                                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold transition-all duration-200 active:scale-95 text-xs sm:text-sm whitespace-nowrap ${
                                    isActive ? ACCENTS[accent] : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                                }`}
                            >
                                {tab.icon && <span aria-hidden>{tab.icon}</span>}
                                <span>{tab.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
