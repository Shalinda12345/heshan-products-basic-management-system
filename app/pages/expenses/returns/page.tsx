'use client';

import { useState } from 'react';
import ExpensesNavigation from '@/app/components/expenses/expenses-navigation';
import { PageHeader, PageShell, Card, LoadingRows, TableMessage, tableClasses as t } from '@/app/components/ui/page-shell';
import { Button, StatusFilter, filterClass, type StatusChoice } from '@/app/components/ui/form';
import { Badge, DocumentStatusBadge, Notice } from '@/app/components/ui/feedback';
import Pagination, { withPageReset } from '@/app/components/ui/pagination';
import VoidDialog from '@/app/components/ui/void-dialog';
import { queryString } from '@/app/lib/api-client';
import { formatAmount, formatDate, formatQty } from '@/app/lib/format';
import { RETURN_TYPES, type ReturnType } from '@/app/lib/returns';
import { useResource } from '@/app/lib/use-resource';

interface ReturnRow {
    return_id: number;
    return_type: ReturnType;
    product_name: string;
    quantity: number;
    per_unit_amount: number;
    total: number;
    sale_id: number | null;
    expense_item_id: number | null;
    return_date: string;
    status: 'posted' | 'void';
    void_reason: string | null;
    voided_by: string | null;
    created_by: string | null;
    customer_name: string | null;
}

const PAGE_SIZE = 50;
const TYPE_TONES: Record<ReturnType, 'red' | 'blue' | 'violet'> = {
    stock_expense_return: 'red',
    sale_reduction_return: 'blue',
    sale_reduction_expense_return: 'violet',
};

// What voiding a return will undo, in plain words
function voidEffect(row: ReturnRow) {
    const goods = `${formatQty(row.quantity)} × ${row.product_name}`;
    switch (row.return_type) {
        case 'stock_expense_return':
            return <>The {goods} written off go back into stock and expense #{row.expense_item_id} is voided.</>;
        case 'sale_reduction_return':
            return <>Invoice #{row.sale_id} gets back {goods} (Rs. {formatAmount(row.total)}), and those goods are taken out of stock again.</>;
        case 'sale_reduction_expense_return':
            return <>Invoice #{row.sale_id} gets back {goods} (Rs. {formatAmount(row.total)}) and write-off expense #{row.expense_item_id} is voided.</>;
    }
}

export default function ReturnsPage() {
    const [type, setType] = useState<'' | ReturnType>('');
    const [status, setStatus] = useState<StatusChoice>('all');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [page, setPage] = useState(1);
    const [voiding, setVoiding] = useState<ReturnRow | null>(null);
    const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

    const returns = useResource<{ rows: ReturnRow[]; total: number }>(`/api/returns${queryString({ type, status, from, to, page, page_size: PAGE_SIZE })}`);
    const update = withPageReset(setPage);
    const rows = returns.data?.rows ?? [];

    return (
        <PageShell nav={<ExpensesNavigation />}>
            <PageHeader
                title="Returns"
                description="Every return processed from the expense form. Voiding a return reverses exactly what it changed on the invoice, in stock and in expenses."
            />

            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter returns">
                <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => update(setFrom)(e.target.value)} className={filterClass} />
                <span className="text-xs text-slate-500">to</span>
                <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => update(setTo)(e.target.value)} className={filterClass} />
                <select aria-label="Return type" value={type} onChange={(e) => update(setType)(e.target.value as '' | ReturnType)} className={filterClass}>
                    <option value="">All types</option>
                    {(Object.keys(RETURN_TYPES) as ReturnType[]).map((key) => <option key={key} value={key}>{RETURN_TYPES[key].label}</option>)}
                </select>
                <StatusFilter value={status} onChange={update(setStatus)} />
            </div>

            {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
            {returns.error && <Notice tone="error" title="Could not load returns">{returns.error}</Notice>}

            <Card>
                <div className={t.wrapper}>
                    <table className={t.table} aria-label="Returns">
                        <thead>
                            <tr className={t.head}>
                                <th className={t.th}>Return</th>
                                <th className={t.th}>Date</th>
                                <th className={t.th}>Type</th>
                                <th className={t.th}>Goods</th>
                                <th className={t.th}>Invoice</th>
                                <th className={`${t.th} text-right`}>Value (Rs.)</th>
                                <th className={t.th}>Status</th>
                                <th className={t.th}>By</th>
                                <th className={`${t.th} text-right`}>Actions</th>
                            </tr>
                        </thead>
                        <tbody className={`${t.body} ${returns.loading && returns.data ? 'opacity-60' : ''}`}>
                            {!returns.data && returns.loading ? (
                                <LoadingRows colSpan={9} />
                            ) : rows.length === 0 ? (
                                <TableMessage colSpan={9} title="No returns" hint="Returns are processed from the New Expense form (category “Return”)." />
                            ) : rows.map((row) => (
                                <tr key={row.return_id} className={`${t.row} ${row.status === 'void' ? 'opacity-60' : ''}`}>
                                    <td className={`${t.td} font-mono text-xs font-semibold text-slate-300`}>#{row.return_id}</td>
                                    <td className={`${t.td} whitespace-nowrap`}>{formatDate(row.return_date)}</td>
                                    <td className={t.td}><Badge tone={TYPE_TONES[row.return_type]}>{RETURN_TYPES[row.return_type]?.label ?? row.return_type}</Badge></td>
                                    <td className={t.td}><span className="font-semibold text-white">{formatQty(row.quantity)} × {row.product_name}</span></td>
                                    <td className={`${t.td} whitespace-nowrap`}>{row.sale_id ? <>#{row.sale_id}<span className="block text-xs text-slate-500">{row.customer_name}</span></> : '—'}</td>
                                    <td className={`${t.num} ${row.status === 'void' ? 'line-through' : 'text-white font-bold'}`}>{formatAmount(row.total)}</td>
                                    <td className={t.td}><DocumentStatusBadge status={row.status} reason={row.void_reason} /></td>
                                    <td className={`${t.td} whitespace-nowrap text-slate-400`}>{row.created_by ?? '—'}</td>
                                    <td className={`${t.td} text-right`}>
                                        {row.status === 'posted' && (
                                            <Button variant="ghost" size="sm" className="text-rose-300 hover:text-rose-200" onClick={() => setVoiding(row)}>Void</Button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {returns.data && <Pagination page={page} pageSize={PAGE_SIZE} total={returns.data.total} onPage={setPage} />}
            </Card>

            <VoidDialog
                open={voiding !== null}
                title={`Void return #${voiding?.return_id ?? ''}?`}
                url={`/api/returns/${voiding?.return_id}/void`}
                effect={voiding && voidEffect(voiding)}
                onClose={() => setVoiding(null)}
                onVoided={(message) => {
                    setVoiding(null);
                    setNotice({ tone: 'success', text: message });
                    returns.reload();
                }}
            />
        </PageShell>
    );
}
