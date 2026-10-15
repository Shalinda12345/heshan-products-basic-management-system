'use client';

import SectionNav, { type SectionTab } from '@/app/components/ui/section-nav';

const TABS: SectionTab[] = [
    { href: '/pages/expenses', label: 'New Expense', icon: '📝' },
    { href: '/pages/expenses/register', label: 'Expense Register', icon: '🧾' },
    { href: '/pages/expenses/returns', label: 'Returns', icon: '↩️' },
    { href: '/pages/expenses/weekly-expenses', label: 'Weekly Statements', icon: '📈' },
    { href: '/pages/expenses/monthly-expenses', label: 'Monthly Audits', icon: '📅' },
    { href: '/pages/expenses/custom-expenses', label: 'Custom', icon: '🔍' },
];

export default function ExpensesNavigation() {
    return <SectionNav tabs={TABS} accent="rose" label="Expense sections" />;
}
