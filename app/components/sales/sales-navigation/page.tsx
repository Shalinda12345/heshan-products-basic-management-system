'use client';

import { usePathname } from 'next/navigation';

export default function SalesNavigation() {
    const pathname = usePathname();

    const tabs = [
        { href: '/pages/sales', label: 'New Sale', icon: '📝' },
        { href: '/pages/sales/daily-sales', label: 'Daily Reports', icon: '📊' },
        { href: '/pages/sales/weekly-sales', label: 'Weekly Statements', icon: '📈' },
        { href: '/pages/sales/monthly-sales', label: 'Monthly Audits', icon: '📅' },
    ];

    return (
        <div className="sticky top-[84px] z-30 w-full bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <nav className="flex items-center gap-1 py-2">
                    {tabs.map((tab) => {
                        const isActive = pathname === tab.href;
                        return (
                            <a
                                key={tab.href}
                                href={tab.href}
                                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold transition-all duration-200 transform active:scale-95 text-xs sm:text-sm whitespace-nowrap ${
                                    isActive
                                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                                }`}
                            >
                                <span>{tab.icon}</span>
                                <span>{tab.label}</span>
                            </a>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}