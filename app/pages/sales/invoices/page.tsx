'use client';

import React, { useState } from 'react';
import SalesNavigation from '@/app/components/sales/sales-navigation';
import { usePermissions } from '@/app/components/auth/user-provider';
import { PageHeader, PageShell, Card, LoadingRows, TableMessage, tableClasses as t } from '@/app/components/ui/page-shell';
import { Button, filterClass } from '@/app/components/ui/form';
import { DocumentStatusBadge, Notice } from '@/app/components/ui/feedback';
import Pagination from '@/app/components/ui/pagination';
import VoidDialog from '@/app/components/ui/void-dialog';
import { apiGet, errorMessage, queryString } from '@/app/lib/api-client';
import { downloadCsv } from '@/app/lib/csv';
import { formatAmount, formatDate, formatDateTime, formatMoney, formatQty } from '@/app/lib/format';
import { presetRange } from '@/app/lib/periods';
import { useResource } from '@/app/lib/use-resource';

interface Invoice {
    sale_id: number;
    sale_date: string;
    customer_id: number | null;
    customer_name: string;
    grand_total: number;
    status: 'posted' | 'void';
    void_reason: string | null;
    voided_at: string | null;
    voided_by: string | null;
    created_by: string | null;
    created_at: string | null;
    item_count: number;
}

interface InvoicePage {
    rows: Invoice[];
    total: number;
    totals: { posted_count: number; posted_amount: number };
}

interface Line {
    sale_detail_id: number;
    product_name: string;
    quantity: number;
    selling_price: number;
    total: number;
}

const PAGE_SIZE = 50;

export default function InvoicesPage() {
    const { can } = usePermissions();
    const month = presetRange('this_month');
    const [from, setFrom] = useState(month.from);
    const [to, setTo] = useState(month.to);
    const [customerId, setCustomerId] = useState('');
    const [status, setStatus] = useState<'all' | 'posted' | 'void'>('all');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [expanded, setExpanded] = useState<number | null>(null);
    const [lines, setLines] = useState<Record<number, Line[] | 'error'>>({});
    const [voiding, setVoiding] = useState<Invoice | null>(null);
    const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
    const [exporting, setExporting] = useState(false);

    const filters = { from, to, customer_id: customerId, status, q: search.trim() };
    const invoices = useResource<InvoicePage>(`/api/sales/invoices${queryString({ ...filters, page, page_size: PAGE_SIZE })}`);
    const customers = useResource<{ customer_id: number; customer_name: string }[]>('/api/customers?include_inactive=1');

    const update = <T,>(setter: (value: T) => void) => (value: T) => {
        setter(value);
        setPage(1);
    };

    const toggle = async (invoice: Invoice) => {
        if (expanded === invoice.sale_id) {
            setExpanded(null);
            return;
        }
        setExpanded(invoice.sale_id);
        if (lines[invoice.sale_id] && lines[invoice.sale_id] !== 'error') return;
        try {
            const items = await apiGet<Line[]>(`/api/sales/get-sale-items?sale_id=${invoice.sale_id}`);
            setLines((prev) => ({ ...prev, [invoice.sale_id]: items }));
        } catch {
            setLines((prev) => ({ ...prev, [invoice.sale_id]: 'error' }));
        }
    };

    // Every invoice matching the filters, fetched page by page
    const exportCsv = async () => {
        setExporting(true);
        try {
            const all: Invoice[] = [];
            for (let p = 1; p <= 50; p++) {
                const result = await apiGet<InvoicePage>(`/api/sales/invoices${queryString({ ...filters, page: p, page_size: 200 })}`);
                all.push(...result.rows);
                if (all.length >= result.total || result.rows.length === 0) break;
            }
            downloadCsv(`invoices-${from || 'all'}-to-${to || 'all'}.csv`, all, [
                { header: 'Invoice', value: (r) => r.sale_id },
                { header: 'Date', value: (r) => r.sale_date },
                { header: 'Customer', value: (r) => r.customer_name },
                { header: 'Items', value: (r) => r.item_count },
                { header: 'Amount (Rs.)', value: (r) => r.grand_total.toFixed(2) },
                { header: 'Status', value: (r) => r.status },
                { header: 'Void reason', value: (r) => r.void_reason },
                { header: 'Posted by', value: (r) => r.created_by },
            ]);
        } catch (error) {
            setNotice({ tone: 'error', text: errorMessage(error) });
        } finally {
            setExporting(false);
        }
    };

    const rows = invoices.data?.rows ?? [];

    return (
        <PageShell nav={<SalesNavigation />}>
            <PageHeader
                title="Invoices"
                description="Every invoice with who posted it. Voided invoices stay listed but count in no total."
                actions={<Button variant="secondary" onClick={exportCsv} busy={exporting}>⬇ Export CSV</Button>}
            />

            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter invoices">
                <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => update(setFrom)(e.target.value)} className={filterClass} />
                <span className="text-xs text-slate-500">to</span>
                <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => update(setTo)(e.target.value)} className={filterClass} />
                <select aria-label="Customer" value={customerId} onChange={(e) => update(setCustomerId)(e.target.value)} className={filterClass}>
                    <option value="">All customers</option>
                    {(customers.data ?? []).map((c) => <option key={c.customer_id} value={c.customer_id}>{c.customer_name}</option>)}
                </select>
                <select aria-label="Status" value={status} onChange={(e) => update(setStatus)(e.target.value as 'all' | 'posted' | 'void')} className={filterClass}>
                    <option value="all">Posted &amp; void</option>
                    <option value="posted">Posted only</option>
                    <option value="void">Void only</option>
                </select>
                <input type="search" aria-label="Search" placeholder="Invoice # or customer…" value={search} onChange={(e) => update(setSearch)(e.target.value)} className={`${filterClass} w-56`} />
            </div>

            {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
            {invoices.error && <Notice tone="error" title="Could not load invoices">{invoices.error}</Notice>}

            {invoices.data && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="glass-card-sm rounded-2xl p-4">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Posted invoices</p>
                        <p className="mt-1 text-2xl font-extrabold text-white">{invoices.data.totals.posted_count.toLocaleString()}</p>
                    </div>
                    <div className="glass-card-sm rounded-2xl p-4">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Posted total</p>
                        <p className="mt-1 text-2xl font-extrabold text-white">{formatMoney(invoices.data.totals.posted_amount)}</p>
                    </div>
                    <div className="glass-card-sm rounded-2xl p-4">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Average invoice</p>
                        <p className="mt-1 text-2xl font-extrabold text-white">
                            {invoices.data.totals.posted_count ? formatMoney(invoices.data.totals.posted_amount / invoices.data.totals.posted_count) : '—'}
                        </p>
                    </div>
                </div>
            )}

            <Card>
                <div className={t.wrapper}>
                    <table className={t.table} aria-label="Invoices">
                        <thead>
                            <tr className={t.head}>
                                <th className={t.th}>Invoice</th>
                                <th className={t.th}>Date</th>
                                <th className={t.th}>Customer</th>
                                <th className={`${t.th} text-right`}>Items</th>
                                <th className={`${t.th} text-right`}>Amount (Rs.)</th>
                                <th className={t.th}>Status</th>
                                <th className={t.th}>Posted by</th>
                                <th className={`${t.th} text-right`}>Actions</th>
                            </tr>
                        </thead>
                        <tbody className={`${t.body} ${invoices.loading && invoices.data ? 'opacity-60' : ''}`}>
                            {!invoices.data && invoices.loading ? (
                                <LoadingRows colSpan={8} />
                            ) : rows.length === 0 ? (
                                <TableMessage colSpan={8} title="No invoices" hint="Nothing matches these filters." />
                            ) : rows.map((invoice) => {
                                const open = expanded === invoice.sale_id;
                                const detail = lines[invoice.sale_id];
                                return (
                                    <React.Fragment key={invoice.sale_id}>
                                        <tr className={`${t.row} ${invoice.status === 'void' ? 'opacity-60' : ''}`}>
                                            <td className={`${t.td} font-mono text-xs font-semibold text-slate-300`}>#{invoice.sale_id}</td>
                                            <td className={`${t.td} whitespace-nowrap`}>{formatDate(invoice.sale_date)}</td>
                                            <td className={`${t.td} font-semibold text-white`}>{invoice.customer_name}</td>
                                            <td className={t.num}>{invoice.item_count}</td>
                                            <td className={`${t.num} ${invoice.status === 'void' ? 'line-through' : 'text-white font-bold'}`}>{formatAmount(invoice.grand_total)}</td>
                                            <td className={t.td}><DocumentStatusBadge status={invoice.status} reason={invoice.void_reason} /></td>
                                            <td className={`${t.td} whitespace-nowrap text-slate-400`}>{invoice.created_by ?? '—'}</td>
                                            <td className={`${t.td} text-right whitespace-nowrap`}>
                                                <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => toggle(invoice)}>{open ? 'Hide' : 'View'}</Button>
                                                {can('sales.void') && invoice.status === 'posted' && (
                                                    <Button variant="ghost" size="sm" className="text-rose-300 hover:text-rose-200" onClick={() => setVoiding(invoice)}>Void</Button>
                                                )}
                                            </td>
                                        </tr>
                                        {open && (
                                            <tr className="bg-slate-950/40">
                                                <td colSpan={8} className="px-6 py-4">
                                                    {detail === undefined ? (
                                                        <p className="text-sm text-slate-400">Loading lines…</p>
                                                    ) : detail === 'error' ? (
                                                        <p className="text-sm text-rose-300">The lines could not be loaded.</p>
                                                    ) : (
                                                        <table className="w-full max-w-3xl text-xs">
                                                            <thead>
                                                                <tr className="text-left uppercase tracking-wider text-slate-500">
                                                                    <th className="py-1.5 font-bold">Product</th>
                                                                    <th className="py-1.5 text-right font-bold">Qty</th>
                                                                    <th className="py-1.5 text-right font-bold">Unit price</th>
                                                                    <th className="py-1.5 text-right font-bold">Line total</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {detail.map((line) => (
                                                                    <tr key={line.sale_detail_id} className="border-t border-slate-800 text-slate-300">
                                                                        <td className="py-1.5 font-semibold text-white">{line.product_name}</td>
                                                                        <td className="py-1.5 text-right font-mono">{formatQty(line.quantity)}</td>
                                                                        <td className="py-1.5 text-right font-mono">{formatAmount(line.selling_price)}</td>
                                                                        <td className="py-1.5 text-right font-mono">{formatAmount(line.total)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    )}
                                                    <p className="mt-3 text-[11px] text-slate-500">
                                                        {invoice.created_at ? `Posted ${formatDateTime(invoice.created_at)}` : 'Posted before posting times were recorded'}
                                                        {invoice.created_by ? ` by ${invoice.created_by}` : ''}
                                                        {invoice.status === 'void' && ` · Voided ${formatDateTime(invoice.voided_at)}${invoice.voided_by ? ` by ${invoice.voided_by}` : ''}: ${invoice.void_reason ?? ''}`}
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
                {invoices.data && <Pagination page={page} pageSize={PAGE_SIZE} total={invoices.data.total} onPage={setPage} />}
            </Card>

            <VoidDialog
                open={voiding !== null}
                title={`Void invoice #${voiding?.sale_id ?? ''}?`}
                url={`/api/sales/${voiding?.sale_id}/void`}
                effect={voiding && (
                    <>Invoice <strong>#{voiding.sale_id}</strong> for <strong>{voiding.customer_name}</strong> ({formatMoney(voiding.grand_total)}) will be removed from all totals, and its items will be put back into stock.</>
                )}
                onClose={() => setVoiding(null)}
                onVoided={(message) => {
                    setVoiding(null);
                    setNotice({ tone: 'success', text: message });
                    invoices.reload();
                }}
            />
        </PageShell>
    );
}
