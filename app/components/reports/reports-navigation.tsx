'use client';

import { useSearchParams } from 'next/navigation';
import SectionNav, { type SectionTab } from '@/app/components/ui/section-nav';

const TABS: SectionTab[] = [
    { href: '/reports', label: 'Profit & Loss', icon: '📊', permission: 'reports.view' },
    { href: '/reports/products', label: 'Products', icon: '📦', permission: 'reports.view' },
    { href: '/reports/customers', label: 'Customers', icon: '🏪', permission: 'reports.view' },
    { href: '/reports/expenses', label: 'Expenses', icon: '💸', permission: 'reports.view' },
    { href: '/reports/stock', label: 'Stock Health', icon: '🏭', permission: 'reports.view' },
];

// Keeps the chosen period when moving between reports
export default function ReportsNavigation() {
    const searchParams = useSearchParams();
    const query = new URLSearchParams([...searchParams].filter(([key]) => ['preset', 'from', 'to'].includes(key))).toString();
    return <SectionNav tabs={TABS} accent="emerald" label="Report sections" query={query} />;
}
