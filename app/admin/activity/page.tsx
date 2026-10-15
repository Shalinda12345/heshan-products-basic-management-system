'use client';

import React, { useState } from 'react';
import ManageNavigation from '@/app/components/admin/manage-navigation';
import { PageHeader, PageShell, Card, LoadingRows, TableMessage, tableClasses as t } from '@/app/components/ui/page-shell';
import { Button, Toggle, filterClass } from '@/app/components/ui/form';
import { Badge, Notice } from '@/app/components/ui/feedback';
import Pagination, { withPageReset } from '@/app/components/ui/pagination';
import { queryString } from '@/app/lib/api-client';
import { useResource } from '@/app/lib/use-resource';
import { formatDateTime } from '@/app/lib/format';
import { ACTIVITY_CATEGORIES, activityNeedsAttention, type ActivityCategory } from '@/app/lib/activity';

interface ActivityRow {
    activity_id: number;
    occurred_at: string;
    user_id: number | null;
    username: string | null;
    user_name: string | null;
    action: string;
    action_label: string;
    entity_type: string | null;
    entity_id: string | null;
    summary: string;
    details: unknown;
    ip_address: string | null;
    user_agent: string | null;
}

interface ActivityPage {
    rows: ActivityRow[];
    total: number;
    page: number;
    page_size: number;
    users?: { user_id: number; username: string | null; name: string | null }[];
}

const PAGE_SIZE = 50;

const ENTITY_LABELS: Record<string, string> = {
    sale: 'Invoice', expense: 'Expense', return: 'Return', product: 'Product', customer: 'Customer',
    employee: 'Employee', expense_category: 'Expense category', user: 'User',
};

function DetailsView({ details }: { details: unknown }) {
    if (!details || typeof details !== 'object') return <p className="text-slate-500">No further details.</p>;
    const record = details as Record<string, unknown>;
    const changes = record.changes as Record<string, { from: unknown; to: unknown }> | undefined;
    const show = (value: unknown) => (value === null || value === undefined || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value));

    return (
        <div className="space-y-3">
            {changes && Object.keys(changes).length > 0 && (
                <table className="w-full max-w-2xl text-xs">
                    <thead>
                        <tr className="text-left text-slate-500 uppercase tracking-wider">
                            <th className="py-1.5 pr-4 font-bold">Field</th>
                            <th className="py-1.5 pr-4 font-bold">Before</th>
                            <th className="py-1.5 font-bold">After</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(changes).map(([field, change]) => (
                            <tr key={field} className="border-t border-slate-800">
                                <td className="py-1.5 pr-4 font-mono text-slate-400">{field}</td>
                                <td className="py-1.5 pr-4 text-rose-300/90 line-through decoration-rose-500/50">{show(change.from)}</td>
                                <td className="py-1.5 text-emerald-300">{show(change.to)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                {Object.entries(record).filter(([key]) => key !== 'changes').map(([key, value]) => (
                    <React.Fragment key={key}>
                        <dt className="font-mono text-slate-500">{key}</dt>
                        <dd className="text-slate-300 break-words">{Array.isArray(value)
                            ? value.map((item, i) => <span key={i} className="block">{show(item)}</span>)
                            : show(value)}</dd>
                    </React.Fragment>
                ))}
            </dl>
        </div>
    );
}

export default function ActivityLogPage() {
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [userId, setUserId] = useState('');
    const [category, setCategory] = useState<'' | ActivityCategory>('');
    const [attention, setAttention] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [expanded, setExpanded] = useState<number | null>(null);

    const filters = { from, to, user_id: userId, category, attention: attention ? 1 : null, q: search.trim() };
    const log = useResource<ActivityPage>(`/api/activity${queryString({ ...filters, page, page_size: PAGE_SIZE, include_users: 1 })}`);
    const filtered = !!(from || to || userId || category || attention || search.trim());

    const update = withPageReset(setPage);

    const clear = () => {
        setFrom('');
        setTo('');
        setUserId('');
        setCategory('');
        setAttention(false);
        setSearch('');
        setPage(1);
    };

    const rows = log.data?.rows ?? [];

    return (
        <PageShell nav={<ManageNavigation />} wide>
            <PageHeader
                title="Activity log"
                description="Everything done in the system, newest first: who did it, when and from where. Entries can't be edited or deleted."
                actions={
                    <>
                        <Button variant="secondary" onClick={log.reload} busy={log.loading && !!log.data}>↻ Refresh</Button>
                        <a
                            href={`/api/activity${queryString({ ...filters, format: 'csv' })}`}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-700"
                        >
                            ⬇ Export CSV
                        </a>
                    </>
                }
            />

            {/* Filters: one row above everything they scope */}
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter the activity log">
                <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => update(setFrom)(e.target.value)} className={filterClass} />
                <span className="text-xs text-slate-500">to</span>
                <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => update(setTo)(e.target.value)} className={filterClass} />
                <select aria-label="Who" value={userId} onChange={(e) => update(setUserId)(e.target.value)} className={filterClass}>
                    <option value="">Everyone</option>
                    {(log.data?.users ?? []).map((u) => <option key={u.user_id} value={u.user_id}>{u.name ?? u.username}</option>)}
                </select>
                <select aria-label="Area" value={category} onChange={(e) => update(setCategory)(e.target.value as '' | ActivityCategory)} className={filterClass}>
                    <option value="">All areas</option>
                    {(Object.keys(ACTIVITY_CATEGORIES) as ActivityCategory[]).map((c) => <option key={c} value={c}>{ACTIVITY_CATEGORIES[c]}</option>)}
                </select>
                <input type="search" aria-label="Search" placeholder="Search summaries…" value={search} onChange={(e) => update(setSearch)(e.target.value)} className={`${filterClass} w-56`} />
                <Toggle checked={attention} onChange={update(setAttention)} label="Needs attention only" />
                {filtered && <Button variant="ghost" size="sm" onClick={clear}>Clear filters</Button>}
            </div>

            {log.error && <Notice tone="error" title="Could not load the activity log">{log.error}</Notice>}

            <Card>
                <div className={t.wrapper}>
                    <table className={t.table} aria-label="Activity">
                        <thead>
                            <tr className={t.head}>
                                <th className={t.th}>When</th>
                                <th className={t.th}>Who</th>
                                <th className={t.th}>What</th>
                                <th className={t.th}>Details</th>
                                <th className={t.th}><span className="sr-only">More</span></th>
                            </tr>
                        </thead>
                        <tbody className={`${t.body} ${log.loading && log.data ? 'opacity-60' : ''}`}>
                            {!log.data && log.loading ? (
                                <LoadingRows colSpan={5} rows={6} />
                            ) : rows.length === 0 ? (
                                <TableMessage colSpan={5} title="No activity" hint={filtered ? 'Nothing matches these filters.' : 'Actions appear here as people use the system.'} />
                            ) : rows.map((row) => {
                                const open = expanded === row.activity_id;
                                const attentionRow = activityNeedsAttention(row.action);
                                return (
                                    <React.Fragment key={row.activity_id}>
                                        <tr className={`${t.row} align-top`}>
                                            <td className={`${t.td} whitespace-nowrap text-slate-400 font-mono text-xs`}>{formatDateTime(row.occurred_at)}</td>
                                            <td className={`${t.td} whitespace-nowrap`}>
                                                <p className="font-semibold text-slate-100">{row.user_name ?? row.username ?? 'Unknown'}</p>
                                                {row.username && <p className="text-xs font-mono text-slate-500">{row.username}</p>}
                                            </td>
                                            <td className={`${t.td} whitespace-nowrap`}>
                                                <Badge tone={attentionRow ? 'amber' : 'gray'}>{attentionRow ? '⚑ ' : ''}{row.action_label}</Badge>
                                                {row.entity_type && (
                                                    <p className="mt-1 text-xs text-slate-500">{ENTITY_LABELS[row.entity_type] ?? row.entity_type} #{row.entity_id}</p>
                                                )}
                                            </td>
                                            <td className={`${t.td} text-slate-200 min-w-[18rem]`}>{row.summary}</td>
                                            <td className={`${t.td} text-right`}>
                                                <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setExpanded(open ? null : row.activity_id)}>
                                                    {open ? 'Hide' : 'More'}
                                                </Button>
                                            </td>
                                        </tr>
                                        {open && (
                                            <tr className="bg-slate-950/40">
                                                <td colSpan={5} className="px-6 py-4">
                                                    <DetailsView details={row.details} />
                                                    <p className="mt-3 text-[11px] text-slate-500">
                                                        {row.ip_address ? `From ${row.ip_address}` : 'Address not recorded'}{row.user_agent ? ` · ${row.user_agent}` : ''}
                                                    </p>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {log.data && <Pagination page={page} pageSize={PAGE_SIZE} total={log.data.total} onPage={setPage} />}
            </Card>
        </PageShell>
    );
}
