'use client';

import { useState } from 'react';
import ManageNavigation from '@/app/components/admin/manage-navigation';
import { PageHeader, PageShell, Card, LoadingRows, TableMessage, tableClasses as t } from '@/app/components/ui/page-shell';
import { Button, Field, Toggle, inputClass } from '@/app/components/ui/form';
import { ActiveBadge, Badge, Notice } from '@/app/components/ui/feedback';
import Modal from '@/app/components/ui/modal';
import { apiSend, errorMessage } from '@/app/lib/api-client';
import { useResource } from '@/app/lib/use-resource';
import { EXPENSE_KINDS, type ExpenseKind } from '@/app/lib/expense-kinds';

interface Category {
    expense_id: number;
    expense_name: string;
    kind: ExpenseKind;
    is_active: boolean;
}

const KIND_TONES: Record<ExpenseKind, 'gray' | 'blue' | 'violet' | 'amber'> = {
    standard: 'gray',
    quantity: 'blue',
    salary: 'violet',
    return: 'amber',
};

export default function ExpenseCategoriesPage() {
    const categories = useResource<Category[]>('/api/expense-categories?include_inactive=1');
    const [showInactive, setShowInactive] = useState(false);
    const [editing, setEditing] = useState<Category | 'new' | null>(null);
    const [name, setName] = useState('');
    const [kind, setKind] = useState<ExpenseKind>('standard');
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

    const rows = (categories.data ?? []).filter((c) => showInactive || c.is_active);

    const open = (category: Category | 'new') => {
        setName(category === 'new' ? '' : category.expense_name);
        setKind(category === 'new' ? 'standard' : category.kind);
        setFormError(null);
        setEditing(category);
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setFormError(null);
        try {
            if (editing === 'new') {
                await apiSend('/api/expense-categories', 'POST', { expense_name: name, kind });
                setNotice({ tone: 'success', text: `Added "${name.trim()}".` });
            } else if (editing) {
                await apiSend(`/api/expense-categories/${editing.expense_id}`, 'PATCH', { expense_name: name, kind });
                setNotice({ tone: 'success', text: `Saved "${name.trim()}".` });
            }
            setEditing(null);
            categories.reload();
        } catch (error) {
            setFormError(errorMessage(error));
        } finally {
            setSaving(false);
        }
    };

    const setActive = async (category: Category, active: boolean) => {
        try {
            await apiSend(`/api/expense-categories/${category.expense_id}`, 'PATCH', { is_active: active });
            setNotice({ tone: 'success', text: `"${category.expense_name}" is now ${active ? 'in use' : 'retired'}.` });
            categories.reload();
        } catch (error) {
            setNotice({ tone: 'error', text: errorMessage(error) });
        }
    };

    const renaming = editing !== null && editing !== 'new' && name.trim() !== '' && name.trim() !== editing.expense_name;

    return (
        <PageShell nav={<ManageNavigation />}>
            <PageHeader
                title="Expense categories"
                description="The list of expense types on the expense form, and how each is entered."
                actions={<Button onClick={() => open('new')}>+ Add category</Button>}
            />

            {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
            {categories.error && <Notice tone="error" title="Could not load categories">{categories.error}</Notice>}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <Card className="lg:col-span-8">
                    <div className="mb-5"><Toggle checked={showInactive} onChange={setShowInactive} label="Show retired categories" /></div>
                    <div className={t.wrapper}>
                        <table className={t.table} aria-label="Expense categories">
                            <thead>
                                <tr className={t.head}>
                                    <th className={t.th}>Category</th>
                                    <th className={t.th}>Entered as</th>
                                    <th className={t.th}>Status</th>
                                    <th className={`${t.th} text-right`}>Actions</th>
                                </tr>
                            </thead>
                            <tbody className={t.body}>
                                {!categories.data && categories.loading ? (
                                    <LoadingRows colSpan={4} />
                                ) : rows.length === 0 ? (
                                    <TableMessage colSpan={4} title="No categories" />
                                ) : rows.map((c) => (
                                    <tr key={c.expense_id} className={`${t.row} ${c.is_active ? '' : 'opacity-60'}`}>
                                        <td className={`${t.td} font-semibold text-white`}>{c.expense_name}</td>
                                        <td className={t.td}><Badge tone={KIND_TONES[c.kind]}>{EXPENSE_KINDS[c.kind].label}</Badge></td>
                                        <td className={t.td}><ActiveBadge active={c.is_active} /></td>
                                        <td className={`${t.td} text-right whitespace-nowrap`}>
                                            <Button variant="ghost" size="sm" onClick={() => open(c)}>Edit</Button>
                                            <Button variant="ghost" size="sm" onClick={() => setActive(c, !c.is_active)}>{c.is_active ? 'Retire' : 'Restore'}</Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <Card title="How categories are entered" className="lg:col-span-4">
                    <dl className="space-y-4 text-sm">
                        {(Object.keys(EXPENSE_KINDS) as ExpenseKind[]).map((k) => (
                            <div key={k}>
                                <dt><Badge tone={KIND_TONES[k]}>{EXPENSE_KINDS[k].label}</Badge></dt>
                                <dd className="mt-1.5 text-slate-400">{EXPENSE_KINDS[k].description}</dd>
                            </div>
                        ))}
                    </dl>
                </Card>
            </div>

            <Modal
                open={editing !== null}
                title={editing === 'new' ? 'Add expense category' : 'Edit expense category'}
                onClose={() => setEditing(null)}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                        <Button type="submit" form="category-form" busy={saving}>{editing === 'new' ? 'Add category' : 'Save changes'}</Button>
                    </>
                }
            >
                <form id="category-form" onSubmit={save} className="space-y-4">
                    {formError && <Notice tone="error">{formError}</Notice>}
                    <Field label="Category name">
                        {(id) => <input id={id} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required maxLength={255} />}
                    </Field>
                    <Field label="Entered as" hint={EXPENSE_KINDS[kind].description}>
                        {(id) => (
                            <select id={id} className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as ExpenseKind)}>
                                {(Object.keys(EXPENSE_KINDS) as ExpenseKind[]).map((k) => <option key={k} value={k}>{EXPENSE_KINDS[k].label}</option>)}
                            </select>
                        )}
                    </Field>
                    {renaming && (
                        <Notice tone="info">Past expenses in this category will be relabelled &quot;{name.trim()}&quot; so reports keep them together.</Notice>
                    )}
                </form>
            </Modal>
        </PageShell>
    );
}
