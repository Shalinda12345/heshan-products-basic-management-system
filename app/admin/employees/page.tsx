'use client';

import { useState } from 'react';
import ManageNavigation from '@/app/components/admin/manage-navigation';
import { PageHeader, PageShell, Card, LoadingRows, TableMessage, tableClasses as t } from '@/app/components/ui/page-shell';
import { Button, Field, Toggle, filterClass, inputClass } from '@/app/components/ui/form';
import { ActiveBadge, Notice } from '@/app/components/ui/feedback';
import Modal from '@/app/components/ui/modal';
import { apiSend, errorMessage } from '@/app/lib/api-client';
import { useResource } from '@/app/lib/use-resource';

interface Employee {
    employee_id: number;
    employee_name: string;
    employee_address: string;
    employee_contact_no: string;
    maritial_status: string;
    is_active: boolean;
}

interface FormState {
    employee_name: string;
    employee_address: string;
    employee_contact_no: string;
    maritial_status: string;
}

const EMPTY: FormState = { employee_name: '', employee_address: '', employee_contact_no: '', maritial_status: '' };
const MARITAL_STATUSES = ['Single', 'Married', 'Other'];

export default function EmployeesAdminPage() {
    const employees = useResource<{ success: boolean; data: Employee[] }>('/api/employees?include_inactive=1');
    const [search, setSearch] = useState('');
    const [showInactive, setShowInactive] = useState(false);
    const [editing, setEditing] = useState<Employee | 'new' | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

    const rows = (employees.data?.data ?? [])
        .filter((e) => showInactive || e.is_active)
        .filter((e) => `${e.employee_name} ${e.employee_contact_no} ${e.employee_address}`.toLowerCase().includes(search.trim().toLowerCase()));

    const open = (employee: Employee | 'new') => {
        setForm(employee === 'new' ? EMPTY : {
            employee_name: employee.employee_name,
            employee_address: employee.employee_address,
            employee_contact_no: employee.employee_contact_no,
            maritial_status: employee.maritial_status,
        });
        setFormError(null);
        setEditing(employee);
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setFormError(null);
        try {
            if (editing === 'new') {
                await apiSend('/api/employees', 'POST', form);
                setNotice({ tone: 'success', text: `Added "${form.employee_name.trim()}". Salary payments can now be recorded for them.` });
            } else if (editing) {
                await apiSend(`/api/employees/${editing.employee_id}`, 'PATCH', form);
                setNotice({ tone: 'success', text: `Saved "${form.employee_name.trim()}".` });
            }
            setEditing(null);
            employees.reload();
        } catch (error) {
            setFormError(errorMessage(error));
        } finally {
            setSaving(false);
        }
    };

    const setActive = async (employee: Employee, active: boolean) => {
        try {
            await apiSend(`/api/employees/${employee.employee_id}`, 'PATCH', { is_active: active });
            setNotice({ tone: 'success', text: `"${employee.employee_name}" is now ${active ? 'active' : 'inactive'}.` });
            employees.reload();
        } catch (error) {
            setNotice({ tone: 'error', text: errorMessage(error) });
        }
    };

    return (
        <PageShell nav={<ManageNavigation />}>
            <PageHeader
                title="Employees"
                description="People who can be paid salaries, advances and loans. Renaming an employee also renames them on their past salary entries."
                actions={<Button onClick={() => open('new')}>+ Add employee</Button>}
            />

            {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
            {employees.error && <Notice tone="error" title="Could not load employees">{employees.error}</Notice>}

            <Card>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
                    <input type="search" placeholder="Search employees…" aria-label="Search employees" value={search} onChange={(e) => setSearch(e.target.value)} className={`${filterClass} sm:w-72`} />
                    <Toggle checked={showInactive} onChange={setShowInactive} label="Show inactive" />
                </div>
                <div className={t.wrapper}>
                    <table className={t.table} aria-label="Employees">
                        <thead>
                            <tr className={t.head}>
                                <th className={t.th}>Employee</th>
                                <th className={t.th}>Contact number</th>
                                <th className={t.th}>Address</th>
                                <th className={t.th}>Marital status</th>
                                <th className={t.th}>Status</th>
                                <th className={`${t.th} text-right`}>Actions</th>
                            </tr>
                        </thead>
                        <tbody className={`${t.body} ${employees.loading && employees.data ? 'opacity-60' : ''}`}>
                            {!employees.data && employees.loading ? (
                                <LoadingRows colSpan={6} />
                            ) : rows.length === 0 ? (
                                <TableMessage colSpan={6} title="No employees" hint={search ? 'Nothing matches the search.' : 'Add employees to record salary payments.'} />
                            ) : rows.map((e) => (
                                <tr key={e.employee_id} className={`${t.row} ${e.is_active ? '' : 'opacity-60'}`}>
                                    <td className={`${t.td} font-semibold text-white`}>{e.employee_name}</td>
                                    <td className={`${t.td} whitespace-nowrap`}>{e.employee_contact_no || <span className="text-slate-600">—</span>}</td>
                                    <td className={t.td}>{e.employee_address || <span className="text-slate-600">—</span>}</td>
                                    <td className={t.td}>{e.maritial_status || <span className="text-slate-600">—</span>}</td>
                                    <td className={t.td}><ActiveBadge active={e.is_active} /></td>
                                    <td className={`${t.td} text-right whitespace-nowrap`}>
                                        <Button variant="ghost" size="sm" onClick={() => open(e)}>Edit</Button>
                                        <Button variant="ghost" size="sm" onClick={() => setActive(e, !e.is_active)}>{e.is_active ? 'Deactivate' : 'Activate'}</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Modal
                open={editing !== null}
                title={editing === 'new' ? 'Add employee' : 'Edit employee'}
                onClose={() => setEditing(null)}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                        <Button type="submit" form="employee-form" busy={saving}>{editing === 'new' ? 'Add employee' : 'Save changes'}</Button>
                    </>
                }
            >
                <form id="employee-form" onSubmit={save} className="space-y-4">
                    {formError && <Notice tone="error">{formError}</Notice>}
                    <Field label="Full name">
                        {(id) => <input id={id} className={inputClass} value={form.employee_name} onChange={(e) => setForm({ ...form, employee_name: e.target.value })} required maxLength={255} />}
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Contact number">
                            {(id) => <input id={id} type="tel" className={inputClass} value={form.employee_contact_no} onChange={(e) => setForm({ ...form, employee_contact_no: e.target.value })} maxLength={255} />}
                        </Field>
                        <Field label="Marital status">
                            {(id) => (
                                <select id={id} className={inputClass} value={form.maritial_status} onChange={(e) => setForm({ ...form, maritial_status: e.target.value })}>
                                    <option value="">Not given</option>
                                    {[...new Set([...MARITAL_STATUSES, form.maritial_status].filter(Boolean))].map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                            )}
                        </Field>
                    </div>
                    <Field label="Address">
                        {(id) => <input id={id} className={inputClass} value={form.employee_address} onChange={(e) => setForm({ ...form, employee_address: e.target.value })} maxLength={255} />}
                    </Field>
                </form>
            </Modal>
        </PageShell>
    );
}
