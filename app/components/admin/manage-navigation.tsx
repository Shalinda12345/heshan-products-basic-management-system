'use client';

import SectionNav, { type SectionTab } from '@/app/components/ui/section-nav';

export const MANAGE_TABS: SectionTab[] = [
    { href: '/admin/products', label: 'Products', icon: '📦', permission: 'masterdata.manage' },
    { href: '/admin/customers', label: 'Customers', icon: '🏪', permission: 'masterdata.manage' },
    { href: '/admin/employees', label: 'Employees', icon: '👷', permission: 'masterdata.manage' },
    { href: '/admin/expense-categories', label: 'Expense Categories', icon: '🏷️', permission: 'masterdata.manage' },
    { href: '/admin/users', label: 'Users & Access', icon: '🔐', permission: 'users.manage' },
    { href: '/admin/activity', label: 'Activity Log', icon: '🕘', permission: 'activity.view' },
];

export default function ManageNavigation() {
    return <SectionNav tabs={MANAGE_TABS} accent="violet" label="Management sections" />;
}
