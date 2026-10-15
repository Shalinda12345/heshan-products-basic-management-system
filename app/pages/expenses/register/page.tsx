'use client';

import { useState } from 'react';
import ExpensesNavigation from '@/app/components/expenses/expenses-navigation';
import { usePermissions } from '@/app/components/auth/user-provider';
import { PageHeader, PageShell, Card, LoadingRows, TableMessage, tableClasses as t } from '@/app/components/ui/page-shell';
import { Button, Field, StatusFilter, filterClass, inputClass, type StatusChoice } from '@/app/components/ui/form';
import { Badge, DocumentStatusBadge, Notice } from '@/app/components/ui/feedback';
import Modal from '@/app/components/ui/modal';
import Pagination, { withPageReset } from '@/app/components/ui/pagination';
import VoidDialog from '@/app/components/ui/void-dialog';
import { apiSend, errorMessage, fetchAllPages, queryString } from '@/app/lib/api-client';
import { downloadCsv } from '@/app/lib/csv';
import type { ExpenseKind } from '@/app/lib/expense-kinds';
import { formatAmount, formatDate, formatMoney, formatQty } from '@/app/lib/format';
import { presetRange } from '@/app/lib/periods';
import { useResource } from '@/app/lib/use-resource';

interface Expense {
    expense_item_id: number;
    expense_name: string;
    employee_name: string | null;
    quantity: number | null;
    per_expense_amount: number;
    total: number;
    expense_date: string;
    status: 'posted' | 'void';
    void_reason: string | null;
    voided_by: string | null;
    created_by: string | null;
    return_id: number | null;
}

interface ExpensePage {
    rows: Expense[];
    total: number;
    totals: { posted_count: number; posted_amount: number };
}

interface Category {
    expense_id: number;
    expense_name: string;
    kind: ExpenseKind;
    is_active: boolean;
}

const PAGE_SIZE = 50;

export default function ExpenseRegisterPage() {
    const { can } = usePermissions();
    const month = presetRange('this_month');
    const [from, setFrom] = useState(month.from);
    const [to, setTo] = useState(month.to);
    const [category, setCategory] = useState('');
    const [status, setStatus] = useState<StatusChoice>('all');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
    const [voiding, setVoiding] = useState<Expense | null>(null);
    const [editing, setEditing] = useState<Expense | null>(null);
    const [form, setForm] = useState({ expense_name: '', employee_name: '', quantity: '', per_expense_amount: '', expense_date: '' });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);

    const filters = { from, to, category, status, q: search.trim() };
    const expenses = useResource<ExpensePage>(`/api/expenses/list${queryString({ ...filters, page, page_size: PAGE_SIZE })}`);
    const categories = useResource<Category[]>('/api/expense-categories?include_inactive=1');
    const employees = useResource<{ data: { employee_id: number; employee_name: string; is_active: boolean }[] }>('/api/employees?include_inactive=1');

    const update = withPageReset(setPage);

    const kindOf = (name: string): ExpenseKind | undefined => categories.data?.find((c) => c.expense_name === name)?.kind;
    const formKind = kindOf(form.expense_name);
    // Quantity is asked for quantity categories, and kept for any entry recorded with a quantity other than 1
    // (otherwise correcting, say, its date would quietly reset it to 1 and change the total)
    const showQuantity = formKind === 'quantity'
        || (editing !== null && form.expense_name === editing.expense_name && Number(editing.quantity ?? 1) !== 1);

    const openEdit = (expense: Expense) => {
        setForm({
            expense_name: expense.expense_name,
            employee_name: expense.employee_name ?? '',
            quantity: String(expense.quantity ?? 1),
            per_expense_amount: String(expense.per_expense_amount),
            expense_date: expense.expense_date,
        });
        setFormError(null);
        setEditing(expense);
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing) return;
        setSaving(true);
        setFormError(null);
        try {
            const result = await apiSend<{ data: { changed: boolean } }>(`/api/expenses/${editing.expense_item_id}`, 'PATCH', {
                expense_name: form.expense_name,
                employee_name: formKind === 'salary' ? form.employee_name : null,
                quantity: showQuantity ? form.quantity : 1,
                per_expense_amount: form.per_expense_amount,
                expense_date: form.expense_date,
            });
            setEditing(null);
            setNotice({ tone: 'success', text: result.data.changed ? `Expense #${editing.expense_item_id} corrected.` : 'Nothing was changed.' });
            expenses.reload();
        } catch (error) {
            setFormError(errorMessage(error));
        } finally {
            setSaving(false);
        }
    };

    const exportCsv = async () => {
        setExporting(true);
        try {
            const all = await fetchAllPages<Expense>('/api/expenses/list', filters);
            downloadCsv(`expenses-${from || 'all'}-to-${to || 'all'}.csv`, all, [
                { header: 'Expense', value: (r) => r.expense_item_id },
                { header: 'Date', value: (r) => r.expense_date },
                { header: 'Category', value: (r) => r.expense_name },
                { header: 'Employee', value: (r) => r.employee_name },
                { header: 'Quantity', value: (r) => r.quantity },
                { header: 'Rate (Rs.)', value: (r) => r.per_expense_amount.toFixed(2) },
                { header: 'Amount (Rs.)', value: (r) => r.total.toFixed(2) },
                { header: 'Status', value: (r) => r.status },
                { header: 'Void reason', value: (r) => r.void_reason },
                { header: 'Recorded by', value: (r) => r.created_by },
            ]);
        } catch (error) {
            setNotice({ tone: 'error', text: errorMessage(error) });
        } finally {
            setExporting(false);
        }
    };

    const rows = expenses.data?.rows ?? [];
    const categoryNames = [...new Set((categories.data ?? []).filter((c) => c.kind !== 'return').map((c) => c.expense_name))];

    return (
        <PageShell nav={<ExpensesNavigation />}>
            <PageHeader
                title="Expense register"
                description="Every expense with who recorded it. Correct mistakes or void entries here; voided entries stay listed but count in no total."
                actions={<Button variant="secondary" onClick={exportCsv} busy={exporting}>⬇ Export CSV</Button>}
            />

            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter expenses">
                <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => update(setFrom)(e.target.value)} className={filterClass} />
                <span className="text-xs text-slate-500">to</span>
                <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => update(setTo)(e.target.value)} className={filterClass} />
                <select aria-label="Category" value={category} onChange={(e) => update(setCategory)(e.target.value)} className={filterClass}>
                    <option value="">All categories</option>
                    {categoryNames.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                <StatusFilter value={status} onChange={update(setStatus)} />
                <input type="search" aria-label="Search" placeholder="Expense #, category or employee…" value={search} onChange={(e) => update(setSearch)(e.target.value)} className={`${filterClass} w-64`} />
            </div>

            {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
            {expenses.error && <Notice tone="error" title="Could not load expenses">{expenses.error}</Notice>}

            {expenses.data && (
                <div className="grid grid-cols-2 gap-4 md:max-w-xl">
                    <div className="glass-card-sm rounded-2xl p-4">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Posted entries</p>
                        <p className="mt-1 text-2xl font-extrabold text-white">{expenses.data.totals.posted_count.toLocaleString()}</p>
                    </div>
                    <div className="glass-card-sm rounded-2xl p-4">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Posted total</p>
                        <p className="mt-1 text-2xl font-extrabold text-white">{formatMoney(expenses.data.totals.posted_amount)}</p>
                    </div>
                </div>
            )}

            <Card>
                <div className={t.wrapper}>
                    <table className={t.table} aria-label="Expenses">
                        <thead>
                            <tr className={t.head}>
                                <th className={t.th}>Entry</th>
                                <th className={t.th}>Date</th>
                                <th className={t.th}>Category</th>
                                <th className={`${t.th} text-right`}>Details</th>
                                <th className={`${t.th} text-right`}>Amount (Rs.)</th>
                                <th className={t.th}>Status</th>
                                <th className={t.th}>Recorded by</th>
                                <th className={`${t.th} text-right`}>Actions</th>
                            </tr>
                        </thead>
                        <tbody className={`${t.body} ${expenses.loading && expenses.data ? 'opacity-60' : ''}`}>
                            {!expenses.data && expenses.loading ? (
                                <LoadingRows colSpan={8} />
                            ) : rows.length === 0 ? (
                                <TableMessage colSpan={8} title="No expenses" hint="Nothing matches these filters." />
                            ) : rows.map((expense) => (
                                <tr key={expense.expense_item_id} className={`${t.row} ${expense.status === 'void' ? 'opacity-60' : ''}`}>
                                    <td className={`${t.td} font-mono text-xs font-semibold text-slate-300`}>#{expense.expense_item_id}</td>
                                    <td className={`${t.td} whitespace-nowrap`}>{formatDate(expense.expense_date)}</td>
                                    <td className={t.td}>
                                        <p className="font-semibold text-white">{expense.expense_name}</p>
                                        {expense.employee_name && <p className="text-xs text-slate-400">{expense.employee_name}</p>}
                                        {expense.return_id && <Badge tone="amber">From return #{expense.return_id}</Badge>}
                                    </td>
                                    <td className={`${t.num} text-xs text-slate-400`}>
                                        {expense.quantity && expense.quantity !== 1 ? `${formatQty(expense.quantity)} × ${formatAmount(expense.per_expense_amount)}` : '—'}
                                    </td>
                                    <td className={`${t.num} ${expense.status === 'void' ? 'line-through' : 'text-white font-bold'}`}>{formatAmount(expense.total)}</td>
                                    <td className={t.td}><DocumentStatusBadge status={expense.status} reason={expense.void_reason} /></td>
                                    <td className={`${t.td} whitespace-nowrap text-slate-400`}>{expense.created_by ?? '—'}</td>
                                    <td className={`${t.td} text-right whitespace-nowrap`}>
                                        {can('expenses.edit') && expense.status === 'posted' && !expense.return_id && (
                                            <>
                                                <Button variant="ghost" size="sm" onClick={() => openEdit(expense)}>Correct</Button>
                                                <Button variant="ghost" size="sm" className="text-rose-300 hover:text-rose-200" onClick={() => setVoiding(expense)}>Void</Button>
                                            </>
                                        )}
                                        {expense.return_id && expense.status === 'posted' && (
                                            <span className="text-xs text-slate-500">Void the return to undo</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {expenses.data && <Pagination page={page} pageSize={PAGE_SIZE} total={expenses.data.total} onPage={setPage} />}
            </Card>

            <Modal
                open={editing !== null}
                title={`Correct expense #${editing?.expense_item_id ?? ''}`}
                description="The total is worked out again from the quantity and amount. The change is recorded in the activity log."
                onClose={() => setEditing(null)}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                        <Button type="submit" form="expense-form" busy={saving}>Save correction</Button>
                    </>
                }
            >
                <form id="expense-form" onSubmit={save} className="space-y-4">
                    {formError && <Notice tone="error">{formError}</Notice>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Date">
                            {(id) => <input id={id} type="date" className={inputClass} value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} required />}
                        </Field>
                        <Field label="Category">
                            {(id) => (
                                <select id={id} className={inputClass} value={form.expense_name} onChange={(e) => setForm({ ...form, expense_name: e.target.value })} required>
                                    {categoryNames.map((name) => <option key={name} value={name}>{name}</option>)}
                                    {!categoryNames.includes(form.expense_name) && <option value={form.expense_name}>{form.expense_name}</option>}
                                </select>
                            )}
                        </Field>
                    </div>
                    {formKind === 'salary' && (
                        <Field label="Employee">
                            {(id) => (
                                <select id={id} className={inputClass} value={form.employee_name} onChange={(e) => setForm({ ...form, employee_name: e.target.value })} required>
                                    <option value="">Choose employee</option>
                                    {(employees.data?.data ?? []).map((emp) => <option key={emp.employee_id} value={emp.employee_name}>{emp.employee_name}{emp.is_active ? '' : ' (inactive)'}</option>)}
                                </select>
                            )}
                        </Field>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {showQuantity && (
                            <Field label="Quantity">
                                {(id) => <input id={id} type="number" min="0.01" step="any" className={inputClass} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />}
                            </Field>
                        )}
                        <Field label={showQuantity ? 'Rate per item (Rs.)' : 'Amount (Rs.)'}>
                            {(id) => <input id={id} type="number" min="0.01" step="0.01" className={inputClass} value={form.per_expense_amount} onChange={(e) => setForm({ ...form, per_expense_amount: e.target.value })} required />}
                        </Field>
                    </div>
                    <p className="text-sm text-slate-400">
                        New total: <strong className="text-white">{formatMoney((showQuantity ? Number(form.quantity) || 0 : 1) * (Number(form.per_expense_amount) || 0))}</strong>
                        {editing && <> (was {formatMoney(editing.total)})</>}
                    </p>
                </form>
            </Modal>

            <VoidDialog
                open={voiding !== null}
                title={`Void expense #${voiding?.expense_item_id ?? ''}?`}
                url={`/api/expenses/${voiding?.expense_item_id}/void`}
                effect={voiding && (
                    <><strong>{voiding.expense_name}</strong>{voiding.employee_name ? ` for ${voiding.employee_name}` : ''} on {formatDate(voiding.expense_date)} ({formatMoney(voiding.total)}) will be removed from all totals.</>
                )}
                onClose={() => setVoiding(null)}
                onVoided={(message) => {
                    setVoiding(null);
                    setNotice({ tone: 'success', text: message });
                    expenses.reload();
                }}
            />
        </PageShell>
    );
}
