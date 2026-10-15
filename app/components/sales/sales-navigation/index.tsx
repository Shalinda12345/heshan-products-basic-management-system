'use client';

import SectionNav, { type SectionTab } from '@/app/components/ui/section-nav';

const TABS: SectionTab[] = [
    { href: '/pages/sales', label: 'New Sale', icon: '📝' },
    { href: '/pages/sales/invoices', label: 'Invoices', icon: '🧾' },
    { href: '/pages/sales/items-sold', label: 'Items Sold', icon: '📦' },
    { href: '/pages/sales/daily-sales', label: 'Daily Reports', icon: '📊' },
    { href: '/pages/sales/weekly-sales', label: 'Weekly Statements', icon: '📈' },
    { href: '/pages/sales/monthly-sales', label: 'Monthly Audits', icon: '📅' },
    { href: '/pages/sales/custom-sales', label: 'Custom', icon: '🔍' },
];

export default function SalesNavigation() {
    return <SectionNav tabs={TABS} label="Sales sections" />;
}
