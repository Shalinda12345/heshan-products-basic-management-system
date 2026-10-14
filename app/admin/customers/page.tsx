'use client';

import { useState } from 'react';
import ManageNavigation from '@/app/components/admin/manage-navigation';
import { PageHeader, PageShell, Card, LoadingRows, TableMessage, tableClasses as t } from '@/app/components/ui/page-shell';
import { Button, Field, Toggle, filterClass, inputClass } from '@/app/components/ui/form';
import { ActiveBadge, Notice } from '@/app/components/ui/feedback';
import Modal from '@/app/components/ui/modal';
import { apiSend, errorMessage } from '@/app/lib/api-client';
import { useResource } from '@/app/lib/use-resource';
import { formatAmount, formatDate } from '@/app/lib/format';

interface Customer {
    customer_id: number;
    customer_name: string;
    phone: string | null;
    address: string | null;
    is_active: boolean;
    invoices: number;
    total_sales: number;
    last_purchase: string | null;
}

interface FormState {
    customer_name: string;
    phone: string;
    address: string;
}

const EMPTY: FormState = { customer_name: '', phone: '', address: '' };

export default function CustomersAdminPage() {
    const customers = useResource<Customer[]>('/api/customers?with_activity=1');
    const [search, setSearch] = useState('');
    const [showInactive, setShowInactive] = useState(false);
    const [editing, setEditing] = useState<Customer | 'new' | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

    const rows = (customers.data ?? [])
        .filter((c) => showInactive || c.is_active)
        .filter((c) => `${c.customer_name} ${c.phone ?? ''} ${c.address ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()));

    const open = (customer: Customer | 'new') => {
        setForm(customer === 'new' ? EMPTY : { customer_name: customer.customer_name, phone: customer.phone ?? '', address: customer.address ?? '' });
        setFormError(null);
        setEditing(customer);
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setFormError(null);
        try {
            if (editing === 'new') {
                await apiSend('/api/customers', 'POST', form);
                setNotice({ tone: 'success', text: `Added "${form.customer_name.trim()}". They can now be chosen on invoices.` });
            } else if (editing) {
                await apiSend(`/api/customers/${editing.customer_id}`, 'PATCH', form);
                setNotice({ tone: 'success', text: `Saved "${form.customer_name.trim()}".` });
            }
            setEditing(null);
            customers.reload();
        } catch (error) {
            setFormError(errorMessage(error));
        } finally {
            setSaving(false);
        }
    };

    const setActive = async (customer: Customer, active: boolean) => {
        try {
            await apiSend(`/api/customers/${customer.customer_id}`, 'PATCH', { is_active: active });
            setNotice({ tone: 'success', text: `"${customer.customer_name}" is now ${active ? 'active' : 'inactive'}.` });
            customers.reload();
        } catch (error) {
            setNotice({ tone: 'error', text: errorMessage(error) });
        }
    };

    return (
        <PageShell nav={<ManageNavigation />}>
            <PageHeader
                title="Customers"
                description="Who you invoice. Inactive customers can't be invoiced but keep their sales history."
                actions={<Button onClick={() => open('new')}>+ Add customer</Button>}
            />

            {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
            {customers.error && <Notice tone="error" title="Could not load customers">{customers.error}</Notice>}

            <Card>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
                    <input type="search" placeholder="Search customers…" aria-label="Search customers" value={search} onChange={(e) => setSearch(e.target.value)} className={`${filterClass} sm:w-72`} />
                    <Toggle checked={showInactive} onChange={setShowInactive} label="Show inactive" />
                </div>
                <div className={t.wrapper}>
                    <table className={t.table} aria-label="Customers">
                        <thead>
                            <tr className={t.head}>
                                <th className={t.th}>Customer</th>
                                <th className={t.th}>Phone</th>
                                <th className={`${t.th} text-right`}>Invoices</th>
                                <th className={`${t.th} text-right`}>Total sales (Rs.)</th>
                                <th className={t.th}>Last purchase</th>
                                <th className={t.th}>Status</th>
                                <th className={`${t.th} text-right`}>Actions</th>
                            </tr>
                        </thead>
                        <tbody className={`${t.body} ${customers.loading && customers.data ? 'opacity-60' : ''}`}>
                            {!customers.data && customers.loading ? (
                                <LoadingRows colSpan={7} />
                            ) : rows.length === 0 ? (
                                <TableMessage colSpan={7} title="No customers" hint={search ? 'Nothing matches the search.' : 'Add a customer to start invoicing.'} />
                            ) : rows.map((c) => (
                                <tr key={c.customer_id} className={`${t.row} ${c.is_active ? '' : 'opacity-60'}`}>
                                    <td className={t.td}>
                                        <p className="font-semibold text-white">{c.customer_name}</p>
                                        {c.address && <p className="text-xs text-slate-500">{c.address}</p>}
                                    </td>
                                    <td className={`${t.td} whitespace-nowrap`}>{c.phone ?? <span className="text-slate-600">—</span>}</td>
                                    <td className={t.num}>{c.invoices.toLocaleString()}</td>
                                    <td className={t.num}>{formatAmount(c.total_sales)}</td>
                                    <td className={`${t.td} whitespace-nowrap`}>{c.last_purchase ? formatDate(c.last_purchase) : <span className="text-slate-600">Never</span>}</td>
                                    <td className={t.td}><ActiveBadge active={c.is_active} /></td>
                                    <td className={`${t.td} text-right whitespace-nowrap`}>
                                        <Button variant="ghost" size="sm" onClick={() => open(c)}>Edit</Button>
                                        <Button variant="ghost" size="sm" onClick={() => setActive(c, !c.is_active)}>{c.is_active ? 'Deactivate' : 'Activate'}</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Modal
                open={editing !== null}
                title={editing === 'new' ? 'Add customer' : 'Edit customer'}
                description={editing === 'new' ? undefined : 'Past invoices keep the name they were issued to; reports follow the customer.'}
                onClose={() => setEditing(null)}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                        <Button type="submit" form="customer-form" busy={saving}>{editing === 'new' ? 'Add customer' : 'Save changes'}</Button>
                    </>
                }
            >
                <form id="customer-form" onSubmit={save} className="space-y-4">
                    {formError && <Notice tone="error">{formError}</Notice>}
                    <Field label="Customer name">
                        {(id) => <input id={id} className={inputClass} value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} required maxLength={255} />}
                    </Field>
                    <Field label="Phone" hint="Optional">
                        {(id) => <input id={id} type="tel" className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={50} />}
                    </Field>
                    <Field label="Address" hint="Optional">
                        {(id) => <input id={id} className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={255} />}
                    </Field>
                </form>
            </Modal>
        </PageShell>
    );
}
