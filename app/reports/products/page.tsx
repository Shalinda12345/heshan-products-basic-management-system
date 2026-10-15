'use client';

import { useState } from 'react';
import Link from 'next/link';
import ReportsNavigation from '@/app/components/reports/reports-navigation';
import { PeriodBar, usePeriod } from '@/app/components/reports/period';
import { RankingChart } from '@/app/components/reports/charts';
import { StatTile, VersusCell } from '@/app/components/reports/stat-tile';
import { PageHeader, PageShell, Card, tableClasses as t } from '@/app/components/ui/page-shell';
import { Button, filterClass } from '@/app/components/ui/form';
import { Badge, Notice, Spinner } from '@/app/components/ui/feedback';
import { queryString } from '@/app/lib/api-client';
import { downloadCsv } from '@/app/lib/csv';
import { formatAmount, formatMoney, formatPercent, formatQty, percentChange } from '@/app/lib/format';
import { useResource } from '@/app/lib/use-resource';

interface ProductRow {
    product_id: number | null;
    product_name: string;
    is_active: boolean;
    units: number;
    revenue: number;
    invoices: number;
    avg_price: number | null;
    share: number;
    prev_units: number;
    prev_revenue: number;
    change: number | null;
    unit_cost: number | null;
    est_cost: number | null;
    est_profit: number | null;
    est_margin: number | null;
    on_hand: number | null;
}

interface ProductsReport {
    period: { label: string; to: string };
    previous: { label: string };
    rows: ProductRow[];
    totals: { units: number; revenue: number; prev_revenue: number; est_profit: number | null; cost_coverage: number | null; not_selling: number };
}

type SortKey = 'revenue' | 'units' | 'change' | 'est_margin';
const SORTS: Record<SortKey, string> = { revenue: 'Revenue', units: 'Units sold', change: 'Change', est_margin: 'Estimated margin' };

export default function ProductsReportPage() {
    const period = usePeriod();
    const report = useResource<ProductsReport>(`/api/reports/products${queryString(period.range)}`);
    const [sort, setSort] = useState<SortKey>('revenue');
    const data = report.data;

    const rows = [...(data?.rows ?? [])].sort((a, b) => {
        const value = (r: ProductRow) => (r[sort] ?? -Infinity) as number;
        return value(b) - value(a) || b.revenue - a.revenue;
    });
    const top = (data?.rows ?? []).filter((r) => r.revenue > 0).slice(0, 10).map((r) => ({ name: r.product_name, value: r.revenue }));
    const revenueChange = data ? percentChange(data.totals.revenue, data.totals.prev_revenue) : null;

    const exportCsv = () => data && downloadCsv(`product-performance-${data.period.label.replace(/\s+/g, '-')}.csv`, rows, [
        { header: 'Product', value: (r) => r.product_name },
        { header: 'Units sold', value: (r) => r.units },
        { header: 'Revenue (Rs.)', value: (r) => r.revenue.toFixed(2) },
        { header: 'Share of revenue (%)', value: (r) => r.share },
        { header: 'Previous revenue (Rs.)', value: (r) => r.prev_revenue.toFixed(2) },
        { header: 'Change (%)', value: (r) => r.change },
        { header: 'Average price (Rs.)', value: (r) => r.avg_price },
        { header: 'Unit cost (Rs.)', value: (r) => r.unit_cost },
        { header: 'Estimated profit (Rs.)', value: (r) => r.est_profit },
        { header: 'Estimated margin (%)', value: (r) => r.est_margin },
        { header: 'In stock', value: (r) => r.on_hand },
    ]);

    return (
        <PageShell nav={<ReportsNavigation />}>
            <PageHeader
                title="Product performance"
                description="Which products bring in the money, which are growing or slipping, and (where unit costs are set) what each earns."
            />
            <PeriodBar period={period} comparedWith={data?.previous.label} />

            {report.error && <Notice tone="error" title="Could not build the report">{report.error}</Notice>}
            {!data ? (report.loading && <Spinner label="Building the report…" />) : (
                <div className={`space-y-8 transition-opacity ${report.loading ? 'opacity-60' : ''}`}>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatTile label="Revenue" value={formatMoney(data.totals.revenue)} change={revenueChange} previous={formatMoney(data.totals.prev_revenue)} />
                        <StatTile label="Units sold" value={formatQty(data.totals.units)} />
                        <StatTile
                            label="Estimated gross profit"
                            value={data.totals.est_profit === null ? 'Set unit costs' : formatMoney(data.totals.est_profit)}
                            hint={data.totals.cost_coverage === null ? undefined : `Covers ${formatPercent(data.totals.cost_coverage, 0)} of revenue (products with a unit cost)`}
                        />
                        <StatTile
                            label="Active products not selling"
                            value={String(data.totals.not_selling)}
                            emphasis={data.totals.not_selling > 0 ? 'bad' : null}
                            hint="No sales in this period"
                        />
                    </div>

                    {top.length > 0 && (
                        <Card title="Top products by revenue" description={data.period.label}>
                            <RankingChart data={top} name="Revenue" />
                        </Card>
                    )}

                    <Card
                        title="All products"
                        description={`${data.period.label} against ${data.previous.label}`}
                        actions={
                            <>
                                <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={filterClass}>
                                    {(Object.keys(SORTS) as SortKey[]).map((key) => <option key={key} value={key}>Sort: {SORTS[key]}</option>)}
                                </select>
                                <Button variant="secondary" size="sm" onClick={exportCsv}>⬇ CSV</Button>
                            </>
                        }
                    >
                        <div className={t.wrapper}>
                            <table className={t.table} aria-label="Product performance">
                                <thead>
                                    <tr className={t.head}>
                                        <th className={t.th}>Product</th>
                                        <th className={`${t.th} text-right`}>Units</th>
                                        <th className={`${t.th} text-right`}>Revenue</th>
                                        <th className={`${t.th} text-right`}>Share</th>
                                        <th className={`${t.th} text-right`}>vs before</th>
                                        <th className={`${t.th} text-right`}>Avg price</th>
                                        <th className={`${t.th} text-right`}>Est. profit</th>
                                        <th className={`${t.th} text-right`}>Est. margin</th>
                                        <th className={`${t.th} text-right`}>In stock</th>
                                    </tr>
                                </thead>
                                <tbody className={t.body}>
                                    {rows.map((r) => (
                                        <tr key={`${r.product_id ?? r.product_name}`} className={t.row}>
                                            <td className={t.td}>
                                                <span className="font-semibold text-white">{r.product_name}</span>
                                                <span className="ml-2 inline-flex gap-1">
                                                    {!r.is_active && <Badge tone="gray">Inactive</Badge>}
                                                    {r.is_active && r.units === 0 && <Badge tone="amber">No sales</Badge>}
                                                </span>
                                            </td>
                                            <td className={t.num}>{formatQty(r.units)}</td>
                                            <td className={`${t.num} font-bold text-white`}>{formatAmount(r.revenue)}</td>
                                            <td className={t.num}>{formatPercent(r.share)}</td>
                                            <td className={`${t.td} text-right whitespace-nowrap`}>
                                                <VersusCell current={r.revenue} previous={r.prev_revenue} change={r.change} />
                                            </td>
                                            <td className={t.num}>{r.avg_price === null ? '—' : formatAmount(r.avg_price)}</td>
                                            <td className={t.num}>{r.est_profit === null ? <span className="text-slate-600" title="No unit cost set">—</span> : formatAmount(r.est_profit)}</td>
                                            <td className={t.num}>{r.est_margin === null ? <span className="text-slate-600">—</span> : <span className={r.est_margin < 0 ? 'text-rose-300' : ''}>{formatPercent(r.est_margin)}</span>}</td>
                                            <td className={t.num}>{r.on_hand === null ? '—' : formatQty(r.on_hand)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="mt-3 text-xs text-slate-500">
                            Estimated profit = revenue − units × the product&apos;s current unit cost.
                            {' '}<Link href="/admin/products" className="text-sky-400 hover:underline">Set unit costs on the Products page</Link>.
                            Production costs are also recorded as expenses, so don&apos;t add this to net profit.
                        </p>
                    </Card>
                </div>
            )}
        </PageShell>
    );
}
