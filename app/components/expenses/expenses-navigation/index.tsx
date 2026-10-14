'use client';

import SectionNav, { type SectionTab } from '@/app/components/ui/section-nav';

const TABS: SectionTab[] = [
    { href: '/pages/expenses', label: 'New Expense', icon: '📝', permission: 'expenses.create' },
    { href: '/pages/expenses/register', label: 'Expense Register', icon: '🧾', permission: 'expenses.view' },
    { href: '/pages/expenses/returns', label: 'Returns', icon: '↩️', permission: 'returns.manage' },
    { href: '/pages/expenses/weekly-expenses', label: 'Weekly Statements', icon: '📈', permission: 'expenses.view' },
    { href: '/pages/expenses/monthly-expenses', label: 'Monthly Audits', icon: '📅', permission: 'expenses.view' },
    { href: '/pages/expenses/custom-expenses', label: 'Custom', icon: '🔍', permission: 'expenses.view' },
];

export default function ExpensesNavigation() {
    return <SectionNav tabs={TABS} accent="rose" label="Expense sections" />;
}
