'use client';

import { useState } from 'react';
import Link from 'next/link';
import ManageNavigation from '@/app/components/admin/manage-navigation';
import { useCurrentUser } from '@/app/components/auth/user-provider';
import { PageHeader, PageShell, Card, LoadingRows, TableMessage, tableClasses as t } from '@/app/components/ui/page-shell';
import { Button, Field, Toggle, inputClass } from '@/app/components/ui/form';
import { Badge, Notice } from '@/app/components/ui/feedback';
import Modal from '@/app/components/ui/modal';
import { apiSend, errorMessage } from '@/app/lib/api-client';
import { useResource } from '@/app/lib/use-resource';
import { formatDateTime } from '@/app/lib/format';
import { PERMISSIONS, ROLES, ROLE_INFO, hasPermission, type Permission, type Role } from '@/app/lib/permissions';

interface UserRow {
    id: number;
    username: string;
    name: string;
    email: string | null;
    role: Role;
    is_active: boolean;
    must_change_password: boolean;
    locked: boolean;
    last_login_at: string | null;
    created_at: string | null;
}

interface Credentials {
    title: string;
    username: string;
    password: string;
}

const ROLE_TONES: Record<Role, 'violet' | 'blue' | 'green' | 'gray'> = { admin: 'violet', owner: 'blue', manager: 'green', staff: 'gray' };

type Confirm = { kind: 'reset' | 'signout'; user: UserRow } | null;

export default function UsersAdminPage() {
    const me = useCurrentUser();
    const users = useResource<UserRow[]>('/api/users');
    const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
    const [form, setForm] = useState({ name: '', username: '', email: '', role: 'staff' as Role, is_active: true });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
    const [credentials, setCredentials] = useState<Credentials | null>(null);
    const [confirm, setConfirm] = useState<Confirm>(null);
    const [confirming, setConfirming] = useState(false);
    const [copied, setCopied] = useState(false);

    const open = (user: UserRow | 'new') => {
        setForm(user === 'new'
            ? { name: '', username: '', email: '', role: 'staff', is_active: true }
            : { name: user.name, username: user.username, email: user.email ?? '', role: user.role, is_active: user.is_active });
        setFormError(null);
        setEditing(user);
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setFormError(null);
        try {
            if (editing === 'new') {
                const result = await apiSend<{ data: { username: string; temporaryPassword: string } }>('/api/users', 'POST', {
                    name: form.name, username: form.username, email: form.email, role: form.role,
                });
                setEditing(null);
                setCopied(false);
                setCredentials({ title: `Account created for ${form.name.trim()}`, username: result.data.username, password: result.data.temporaryPassword });
            } else if (editing) {
                await apiSend(`/api/users/${editing.id}`, 'PATCH', { name: form.name, email: form.email, role: form.role, is_active: form.is_active });
                setEditing(null);
                setNotice({ tone: 'success', text: `Saved ${form.name.trim()}.` });
            }
            users.reload();
        } catch (error) {
            setFormError(errorMessage(error));
        } finally {
            setSaving(false);
        }
    };

    const runConfirm = async () => {
        if (!confirm) return;
        setConfirming(true);
        try {
            if (confirm.kind === 'reset') {
                const result = await apiSend<{ data: { username: string; temporaryPassword: string } }>(`/api/users/${confirm.user.id}/reset-password`, 'POST');
                setCopied(false);
                setCredentials({ title: `New password for ${confirm.user.name}`, username: result.data.username, password: result.data.temporaryPassword });
            } else {
                await apiSend(`/api/users/${confirm.user.id}/sign-out`, 'POST');
                setNotice({ tone: 'success', text: `${confirm.user.name} has been signed out of every device.` });
            }
            setConfirm(null);
            users.reload();
        } catch (error) {
            setNotice({ tone: 'error', text: errorMessage(error) });
            setConfirm(null);
        } finally {
            setConfirming(false);
        }
    };

    const copy = async () => {
        if (!credentials) return;
        try {
            await navigator.clipboard.writeText(`Username: ${credentials.username}\nPassword: ${credentials.password}`);
            setCopied(true);
        } catch {
            setCopied(false);
        }
    };

    const editingUser = editing !== null && editing !== 'new' ? editing : null;
    const editingSelf = editingUser !== null && editingUser.id === me?.id;
    const roleChanged = editingUser !== null && (form.role !== editingUser.role || form.is_active !== editingUser.is_active);

    return (
        <PageShell nav={<ManageNavigation />}>
            <PageHeader
                title="Users & access"
                description="Who can sign in and what each person may do. Changing someone's role or disabling them signs them out immediately."
                actions={<Button onClick={() => open('new')}>+ Add user</Button>}
            />

            {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
            {users.error && <Notice tone="error" title="Could not load users">{users.error}</Notice>}

            <Card>
                <div className={t.wrapper}>
                    <table className={t.table} aria-label="Users">
                        <thead>
                            <tr className={t.head}>
                                <th className={t.th}>Name</th>
                                <th className={t.th}>Username</th>
                                <th className={t.th}>Role</th>
                                <th className={t.th}>Status</th>
                                <th className={t.th}>Last sign-in</th>
                                <th className={`${t.th} text-right`}>Actions</th>
                            </tr>
                        </thead>
                        <tbody className={`${t.body} ${users.loading && users.data ? 'opacity-60' : ''}`}>
                            {!users.data && users.loading ? (
                                <LoadingRows colSpan={6} />
                            ) : (users.data ?? []).length === 0 ? (
                                <TableMessage colSpan={6} title="No users" />
                            ) : (users.data ?? []).map((u) => (
                                <tr key={u.id} className={`${t.row} ${u.is_active ? '' : 'opacity-60'}`}>
                                    <td className={t.td}>
                                        <p className="font-semibold text-white">{u.name}{u.id === me?.id && <span className="ml-2 text-xs font-medium text-slate-500">(you)</span>}</p>
                                        {u.email && <p className="text-xs text-slate-500">{u.email}</p>}
                                    </td>
                                    <td className={`${t.td} font-mono text-slate-300`}>{u.username}</td>
                                    <td className={t.td}><Badge tone={ROLE_TONES[u.role]}>{ROLE_INFO[u.role].label}</Badge></td>
                                    <td className={t.td}>
                                        <div className="flex flex-wrap gap-1.5">
                                            {u.is_active ? <Badge tone="green">● Active</Badge> : <Badge tone="gray">○ Disabled</Badge>}
                                            {u.locked && <Badge tone="red" title="Too many wrong passwords; unlocks by itself, or reset the password">🔒 Locked</Badge>}
                                            {u.must_change_password && u.is_active && <Badge tone="amber" title="Must choose a new password at the next sign-in">Password pending</Badge>}
                                        </div>
                                    </td>
                                    <td className={`${t.td} whitespace-nowrap text-slate-400`}>{u.last_login_at ? formatDateTime(u.last_login_at) : 'Never'}</td>
                                    <td className={`${t.td} text-right whitespace-nowrap`}>
                                        <Button variant="ghost" size="sm" onClick={() => open(u)}>Edit</Button>
                                        {u.id === me?.id ? (
                                            <Link href="/account" className="inline-flex px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/70">Change password</Link>
                                        ) : (
                                            <>
                                                <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: 'reset', user: u })}>Reset password</Button>
                                                <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: 'signout', user: u })}>Sign out</Button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Card title="Who can do what" description="Roles are fixed so permissions stay predictable. The server checks these on every request.">
                <div className={t.wrapper}>
                    <table className={t.table} aria-label="Role permissions">
                        <thead>
                            <tr className={t.head}>
                                <th className={t.th}>Permission</th>
                                {ROLES.map((role) => <th key={role} className={`${t.th} text-center`}>{ROLE_INFO[role].label}</th>)}
                            </tr>
                        </thead>
                        <tbody className={t.body}>
                            {(Object.keys(PERMISSIONS) as Permission[]).map((permission) => (
                                <tr key={permission} className={t.row}>
                                    <td className={t.td}>{PERMISSIONS[permission]}</td>
                                    {ROLES.map((role) => (
                                        <td key={role} className={`${t.td} text-center`}>
                                            {hasPermission(role, permission)
                                                ? <span className="text-emerald-400" aria-label="Yes">✓</span>
                                                : <span className="text-slate-600" aria-label="No">—</span>}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <dl className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    {ROLES.map((role) => (
                        <div key={role}>
                            <dt><Badge tone={ROLE_TONES[role]}>{ROLE_INFO[role].label}</Badge></dt>
                            <dd className="mt-1.5 text-slate-400">{ROLE_INFO[role].description}</dd>
                        </div>
                    ))}
                </dl>
            </Card>

            <Modal
                open={editing !== null}
                title={editing === 'new' ? 'Add user' : `Edit ${editing?.name ?? ''}`}
                description={editing === 'new' ? 'A temporary password is created for them; they choose their own at the first sign-in.' : undefined}
                onClose={() => setEditing(null)}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                        <Button type="submit" form="user-form" busy={saving}>{editing === 'new' ? 'Create account' : 'Save changes'}</Button>
                    </>
                }
            >
                <form id="user-form" onSubmit={save} className="space-y-4">
                    {formError && <Notice tone="error">{formError}</Notice>}
                    <Field label="Full name">
                        {(id) => <input id={id} className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={255} />}
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Username" hint={editing === 'new' ? 'Letters, numbers, dots, dashes; used to sign in' : 'Usernames cannot be changed'}>
                            {(id) => (
                                <input id={id} className={`${inputClass} font-mono`} value={form.username} disabled={editing !== 'new'} autoCapitalize="none" spellCheck={false}
                                    onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} required minLength={3} maxLength={50} pattern="[a-zA-Z0-9._\-]+" />
                            )}
                        </Field>
                        <Field label="Email" hint="Optional">
                            {(id) => <input id={id} type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} />}
                        </Field>
                    </div>
                    <Field label="Role" hint={editingSelf ? 'You cannot change your own role.' : ROLE_INFO[form.role].description}>
                        {(id) => (
                            <select id={id} className={inputClass} value={form.role} disabled={editingSelf} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                                {ROLES.map((role) => <option key={role} value={role}>{ROLE_INFO[role].label}</option>)}
                            </select>
                        )}
                    </Field>
                    {editing !== 'new' && (
                        <Toggle checked={form.is_active} disabled={editingSelf} onChange={(value) => setForm({ ...form, is_active: value })} label="Account enabled (can sign in)" />
                    )}
                    {roleChanged && <Notice tone="warning">{editingUser?.name ?? 'The user'} will be signed out so the change takes effect immediately.</Notice>}
                </form>
            </Modal>

            <Modal
                open={confirm !== null}
                size="sm"
                title={confirm?.kind === 'reset' ? `Reset ${confirm.user.name}'s password?` : `Sign ${confirm?.user.name} out everywhere?`}
                onClose={() => setConfirm(null)}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
                        <Button variant={confirm?.kind === 'reset' ? 'primary' : 'danger'} busy={confirming} onClick={runConfirm} data-autofocus>
                            {confirm?.kind === 'reset' ? 'Reset password' : 'Sign out'}
                        </Button>
                    </>
                }
            >
                <p className="text-sm text-slate-300">
                    {confirm?.kind === 'reset'
                        ? 'A new temporary password is created and shown to you once. Their account is unlocked and every session they have is ended; they choose a new password at the next sign-in.'
                        : 'Every browser and device they are signed in on is signed out. Use this if a device was lost or shared.'}
                </p>
            </Modal>

            <Modal
                open={credentials !== null}
                title={credentials?.title ?? ''}
                description="Give these to the user in person. The password is shown only now and must be changed at the first sign-in."
                onClose={() => setCredentials(null)}
                footer={
                    <>
                        <Button variant="secondary" onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</Button>
                        <Button onClick={() => setCredentials(null)} data-autofocus>Done</Button>
                    </>
                }
            >
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 rounded-xl border border-slate-700 bg-slate-950/60 p-5 text-sm">
                    <dt className="text-slate-400">Username</dt>
                    <dd className="font-mono font-semibold text-white" data-testid="credential-username">{credentials?.username}</dd>
                    <dt className="text-slate-400">Temporary password</dt>
                    <dd className="font-mono text-lg font-bold tracking-wider text-amber-300" data-testid="credential-password">{credentials?.password}</dd>
                </dl>
            </Modal>
        </PageShell>
    );
}
