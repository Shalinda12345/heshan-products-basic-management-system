'use client';

import Link from 'next/link';
import ReportsNavigation from '@/app/components/reports/reports-navigation';
import { StatTile } from '@/app/components/reports/stat-tile';
import { PageHeader, PageShell, Card, tableClasses as t } from '@/app/components/ui/page-shell';
import { Button } from '@/app/components/ui/form';
import { Badge, Notice, Spinner } from '@/app/components/ui/feedback';
import { downloadCsv } from '@/app/lib/csv';
import { formatAmount, formatDate, formatMoney, formatQty } from '@/app/lib/format';
import { useResource } from '@/app/lib/use-resource';
import { Suspense } from 'react';

interface StockRow {
    product_id: number;
    product_name: string;
    is_active: boolean;
    on_hand: number;
    reorder_level: number;
    status: 'out' | 'low' | 'ok';
    unit_cost: number | null;
    unit_price: number | null;
    stock_value: number | null;
    retail_value: number | null;
    sold_30d: number;
    avg_daily: number;
    days_of_cover: number | null;
    last_sale: string | null;
    slow_moving: boolean;
}

interface StockReport {
    window: { from: string; to: string };
    rows: StockRow[];
    totals: { stock_value: number; retail_value: number; products_out: number; products_low: number; slow_moving: number; missing_cost: number };
}

// Fewer days of stock than this at the current selling rate: reorder soon
const REORDER_DAYS = 7;

// Status always pairs an icon and a word with its colour
function StatusCell({ row }: { row: StockRow }) {
    if (row.status === 'out') return <Badge tone="red">⛔ Out of stock</Badge>;
    if (row.status === 'low') return <Badge tone="amber">⚠ Low</Badge>;
    if (row.days_of_cover !== null && row.days_of_cover < REORDER_DAYS) return <Badge tone="amber">⏱ Runs out soon</Badge>;
    if (row.slow_moving) return <Badge tone="violet">🐢 Slow-moving</Badge>;
    return <Badge tone="green">✓ OK</Badge>;
}

function StockReportContent() {
    const report = useResource<StockReport>('/api/reports/stock');
    const data = report.data;
    const reorder = (data?.rows ?? []).filter((r) => r.is_active && (r.status !== 'ok' || (r.days_of_cover !== null && r.days_of_cover < REORDER_DAYS)));

    const exportCsv = () => data && downloadCsv(`stock-health-${data.window.to}.csv`, data.rows, [
        { header: 'Product', value: (r) => r.product_name },
        { header: 'On hand', value: (r) => r.on_hand },
        { header: 'Reorder level', value: (r) => r.reorder_level },
        { header: 'Status', value: (r) => r.status },
        { header: 'Sold in 30 days', value: (r) => r.sold_30d },
        { header: 'Average per day', value: (r) => r.avg_daily },
        { header: 'Days of cover', value: (r) => r.days_of_cover },
        { header: 'Last sale', value: (r) => r.last_sale },
        { header: 'Unit cost (Rs.)', value: (r) => r.unit_cost },
        { header: 'Stock value at cost (Rs.)', value: (r) => r.stock_value },
    ]);

    return (
        <PageShell nav={<ReportsNavigation />}>
            <PageHeader
                title="Stock health"
                description={`What to reorder, how long stock will last at the selling rate of the last 30 days, and how much money is sitting on the shelves.`}
                actions={<Button variant="secondary" onClick={report.reload} busy={report.loading && !!data}>↻ Refresh</Button>}
            />

            {report.error && <Notice tone="error" title="Could not build the report">{report.error}</Notice>}
            {!data ? (report.loading && <Spinner label="Building the report…" />) : (
                <div className={`space-y-8 transition-opacity ${report.loading ? 'opacity-60' : ''}`}>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatTile label="Stock value at cost" value={formatMoney(data.totals.stock_value)} hint={data.totals.missing_cost ? `${data.totals.missing_cost} product(s) in stock have no unit cost` : 'All products in stock have a unit cost'} />
                        <StatTile label="Stock value at selling price" value={formatMoney(data.totals.retail_value)} />
                        <StatTile label="Out of stock / low" value={`${data.totals.products_out} / ${data.totals.products_low}`} emphasis={data.totals.products_out + data.totals.products_low > 0 ? 'bad' : null} />
                        <StatTile label="Slow-moving products" value={String(data.totals.slow_moving)} hint="In stock but not sold for 60+ days" />
                    </div>

                    {reorder.length > 0 && (
                        <Notice tone="warning" title={`Reorder or produce soon: ${reorder.length} product${reorder.length === 1 ? '' : 's'}`}>
                            {reorder.map((r) => `${r.product_name} (${r.status === 'out' ? 'out of stock' : `${formatQty(r.on_hand)} left${r.days_of_cover !== null ? `, ~${r.days_of_cover} days` : ''}`})`).join(', ')}
                        </Notice>
                    )}

                    <Card
                        title="All products"
                        description={`Sales rate from ${formatDate(data.window.from)} to ${formatDate(data.window.to)}`}
                        actions={<Button variant="secondary" size="sm" onClick={exportCsv}>⬇ CSV</Button>}
                    >
                        <div className={t.wrapper}>
                            <table className={t.table} aria-label="Stock health">
                                <thead>
                                    <tr className={t.head}>
                                        <th className={t.th}>Product</th>
                                        <th className={t.th}>Status</th>
                                        <th className={`${t.th} text-right`}>On hand</th>
                                        <th className={`${t.th} text-right`}>Reorder at</th>
                                        <th className={`${t.th} text-right`}>Sold (30 days)</th>
                                        <th className={`${t.th} text-right`}>Days of cover</th>
                                        <th className={t.th}>Last sale</th>
                                        <th className={`${t.th} text-right`}>Value at cost</th>
                                    </tr>
                                </thead>
                                <tbody className={t.body}>
                                    {data.rows.map((r) => (
                                        <tr key={r.product_id} className={t.row}>
                                            <td className={t.td}>
                                                <span className="font-semibold text-white">{r.product_name}</span>
                                                {!r.is_active && <span className="ml-2"><Badge tone="gray">Inactive</Badge></span>}
                                            </td>
                                            <td className={t.td}><StatusCell row={r} /></td>
                                            <td className={`${t.num} font-bold text-white`}>{formatQty(r.on_hand)}</td>
                                            <td className={t.num}>{formatQty(r.reorder_level)}</td>
                                            <td className={t.num}>{formatQty(r.sold_30d)}<span className="block text-[11px] text-slate-500">{formatQty(r.avg_daily)}/day</span></td>
                                            <td className={t.num}>{r.days_of_cover === null ? <span className="text-slate-500" title="Not sold in the last 30 days">—</span> : `${r.days_of_cover.toLocaleString()} days`}</td>
                                            <td className={`${t.td} whitespace-nowrap`}>{r.last_sale ? formatDate(r.last_sale) : <span className="text-slate-500">Never</span>}</td>
                                            <td className={t.num}>{r.stock_value === null ? <span className="text-amber-400/80" title="Set a unit cost on the Products page">no cost</span> : formatAmount(r.stock_value)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="mt-3 text-xs text-slate-500">
                            Reorder levels and unit costs are set per product on the <Link href="/admin/products" className="text-sky-400 hover:underline">Products page</Link>.
                        </p>
                    </Card>
                </div>
            )}
        </PageShell>
    );
}

export default function StockReportPage() {
    return (
        <Suspense fallback={<Spinner />}>
            <StockReportContent />
        </Suspense>
    );
}
