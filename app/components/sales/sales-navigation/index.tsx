'use client';

import SectionNav, { type SectionTab } from '@/app/components/ui/section-nav';

const TABS: SectionTab[] = [
    { href: '/pages/sales', label: 'New Sale', icon: '📝', permission: 'sales.create' },
    { href: '/pages/sales/invoices', label: 'Invoices', icon: '🧾', permission: 'sales.view' },
    { href: '/pages/sales/items-sold', label: 'Items Sold', icon: '📦', permission: 'sales.view' },
    { href: '/pages/sales/daily-sales', label: 'Daily Reports', icon: '📊', permission: 'sales.view' },
    { href: '/pages/sales/weekly-sales', label: 'Weekly Statements', icon: '📈', permission: 'sales.view' },
    { href: '/pages/sales/monthly-sales', label: 'Monthly Audits', icon: '📅', permission: 'sales.view' },
    { href: '/pages/sales/custom-sales', label: 'Custom', icon: '🔍', permission: 'sales.view' },
];

export default function SalesNavigation() {
    return <SectionNav tabs={TABS} label="Sales sections" />;
}
