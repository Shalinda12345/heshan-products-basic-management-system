'use client';

import SectionNav, { type SectionTab } from '@/app/components/ui/section-nav';

export const MANAGE_TABS: SectionTab[] = [
    { href: '/admin/products', label: 'Products', icon: '📦' },
    { href: '/admin/customers', label: 'Customers', icon: '🏪' },
    { href: '/admin/employees', label: 'Employees', icon: '👷' },
    { href: '/admin/expense-categories', label: 'Expense Categories', icon: '🏷️' },
    { href: '/admin/users', label: 'Users & Access', icon: '🔐' },
    { href: '/admin/activity', label: 'Activity Log', icon: '🕘' },
];

export default function ManageNavigation() {
    return <SectionNav tabs={MANAGE_TABS} accent="violet" label="Management sections" />;
}
