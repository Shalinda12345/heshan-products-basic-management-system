'use client';

import { Suspense } from 'react';
import ReportsNavigation from '@/app/components/reports/reports-navigation';
import { PeriodBar, usePeriod } from '@/app/components/reports/period';
import { RankingChart } from '@/app/components/reports/charts';
import { StatTile, VersusCell } from '@/app/components/reports/stat-tile';
import { PageHeader, PageShell, Card, tableClasses as t } from '@/app/components/ui/page-shell';
import { Button } from '@/app/components/ui/form';
import { Badge, Notice, Spinner } from '@/app/components/ui/feedback';
import { queryString } from '@/app/lib/api-client';
import { downloadCsv } from '@/app/lib/csv';
import { formatAmount, formatDate, formatMoney, formatPercent } from '@/app/lib/format';
import { useResource } from '@/app/lib/use-resource';

interface CustomerRow {
    customer_id: number | null;
    customer_name: string;
    is_active: boolean;
    revenue: number;
    invoices: number;
    avg_invoice: number | null;
    share: number;
    prev_revenue: number;
    change: number | null;
    first_purchase: string | null;
    last_purchase: string | null;
    days_since_last_purchase: number | null;
    is_new: boolean;
}

interface CustomersReport {
    period: { label: string };
    previous: { label: string };
    rows: CustomerRow[];
    totals: {
        revenue: number;
        prev_revenue: number;
        customers_buying: number;
        prev_customers_buying: number;
        new_customers: number;
        lapsed_customers: number;
        top5_share: number | null;
        top_customer: { name: string; share: number } | null;
    };
}

// Haven't bought for this many days: worth a call
const QUIET_DAYS = 30;

function CustomersReportContent() {
    const period = usePeriod();
    const report = useResource<CustomersReport>(`/api/reports/customers${queryString(period.range)}`);
    const data = report.data;

    const top = (data?.rows ?? []).filter((r) => r.revenue > 0).slice(0, 10).map((r) => ({ name: r.customer_name, value: r.revenue }));
    const quiet = (data?.rows ?? []).filter((r) => r.is_active && r.days_since_last_purchase !== null && r.days_since_last_purchase >= QUIET_DAYS);
    const buyingChange = data && data.totals.prev_customers_buying
        ? ((data.totals.customers_buying - data.totals.prev_customers_buying) / data.totals.prev_customers_buying) * 100
        : null;

    const exportCsv = () => data && downloadCsv(`customer-performance-${data.period.label.replace(/\s+/g, '-')}.csv`, data.rows, [
        { header: 'Customer', value: (r) => r.customer_name },
        { header: 'Revenue (Rs.)', value: (r) => r.revenue.toFixed(2) },
        { header: 'Share (%)', value: (r) => r.share },
        { header: 'Invoices', value: (r) => r.invoices },
        { header: 'Average invoice (Rs.)', value: (r) => r.avg_invoice },
        { header: 'Previous revenue (Rs.)', value: (r) => r.prev_revenue.toFixed(2) },
        { header: 'Change (%)', value: (r) => r.change },
        { header: 'First purchase', value: (r) => r.first_purchase },
        { header: 'Last purchase', value: (r) => r.last_purchase },
        { header: 'Days since last purchase', value: (r) => r.days_since_last_purchase },
    ]);

    return (
        <PageShell nav={<ReportsNavigation />}>
            <PageHeader
                title="Customer performance"
                description="Who your best customers are, who is new, and who has gone quiet and may need a call."
            />
            <PeriodBar period={period} comparedWith={data?.previous.label} />

            {report.error && <Notice tone="error" title="Could not build the report">{report.error}</Notice>}
            {!data ? (report.loading && <Spinner label="Building the report…" />) : (
                <div className={`space-y-8 transition-opacity ${report.loading ? 'opacity-60' : ''}`}>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatTile label="Customers who bought" value={String(data.totals.customers_buying)} change={buyingChange} previous={String(data.totals.prev_customers_buying)} />
                        <StatTile label="New customers" value={String(data.totals.new_customers)} hint="First purchase in this period" emphasis={data.totals.new_customers > 0 ? 'good' : null} />
                        <StatTile
                            label="Lapsed customers"
                            value={String(data.totals.lapsed_customers)}
                            hint={`Bought in ${data.previous.label}, not in this period`}
                            emphasis={data.totals.lapsed_customers > 0 ? 'bad' : null}
                        />
                        <StatTile
                            label="Largest customer's share"
                            value={formatPercent(data.totals.top_customer?.share ?? null, 0)}
                            hint={data.totals.top_customer
                                ? `${data.totals.top_customer.name}${data.totals.top_customer.share >= 30 ? ' (a lot rides on one customer)' : ''}${data.totals.customers_buying > 5 ? ` · top 5: ${formatPercent(data.totals.top5_share, 0)}` : ''}`
                                : 'No sales in this period'}
                            emphasis={data.totals.top_customer && data.totals.top_customer.share >= 30 ? 'bad' : null}
                        />
                    </div>

                    {top.length > 0 && (
                        <Card title="Top customers by revenue" description={data.period.label}>
                            <RankingChart data={top} name="Revenue" />
                        </Card>
                    )}

                    {quiet.length > 0 && (
                        <Notice tone="warning" title={`${quiet.length} active customer${quiet.length === 1 ? ' has' : 's have'} not bought for ${QUIET_DAYS}+ days`}>
                            {quiet.slice(0, 8).map((r) => `${r.customer_name} (${r.days_since_last_purchase} days)`).join(', ')}{quiet.length > 8 ? '…' : ''}
                        </Notice>
                    )}

                    <Card
                        title="All customers"
                        description={`${data.period.label} against ${data.previous.label}`}
                        actions={<Button variant="secondary" size="sm" onClick={exportCsv}>⬇ CSV</Button>}
                    >
                        <div className={t.wrapper}>
                            <table className={t.table} aria-label="Customer performance">
                                <thead>
                                    <tr className={t.head}>
                                        <th className={t.th}>Customer</th>
                                        <th className={`${t.th} text-right`}>Revenue</th>
                                        <th className={`${t.th} text-right`}>Share</th>
                                        <th className={`${t.th} text-right`}>vs before</th>
                                        <th className={`${t.th} text-right`}>Invoices</th>
                                        <th className={`${t.th} text-right`}>Avg invoice</th>
                                        <th className={t.th}>Last purchase</th>
                                    </tr>
                                </thead>
                                <tbody className={t.body}>
                                    {data.rows.map((r) => (
                                        <tr key={`${r.customer_id ?? r.customer_name}`} className={t.row}>
                                            <td className={t.td}>
                                                <span className="font-semibold text-white">{r.customer_name}</span>
                                                <span className="ml-2 inline-flex gap-1">
                                                    {r.is_new && <Badge tone="green">New</Badge>}
                                                    {r.prev_revenue > 0 && r.revenue === 0 && <Badge tone="red">Lapsed</Badge>}
                                                    {!r.is_active && <Badge tone="gray">Inactive</Badge>}
                                                </span>
                                            </td>
                                            <td className={`${t.num} font-bold text-white`}>{formatAmount(r.revenue)}</td>
                                            <td className={t.num}>{formatPercent(r.share)}</td>
                                            <td className={`${t.td} text-right whitespace-nowrap`}>
                                                <VersusCell current={r.revenue} previous={r.prev_revenue} change={r.change} />
                                            </td>
                                            <td className={t.num}>{r.invoices}</td>
                                            <td className={t.num}>{r.avg_invoice === null ? '—' : formatAmount(r.avg_invoice)}</td>
                                            <td className={`${t.td} whitespace-nowrap`}>
                                                {r.last_purchase ? (
                                                    <>
                                                        {formatDate(r.last_purchase)}
                                                        <span className={`block text-[11px] ${(r.days_since_last_purchase ?? 0) >= QUIET_DAYS || (r.days_since_last_purchase ?? 0) < 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                                                            {r.days_since_last_purchase === null ? '' : r.days_since_last_purchase < 0
                                                                ? 'dated in the future: check the invoice'
                                                                : r.days_since_last_purchase === 0 ? 'today' : `${r.days_since_last_purchase} day${r.days_since_last_purchase === 1 ? '' : 's'} ago`}
                                                        </span>
                                                    </>
                                                ) : <span className="text-slate-500">Never</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="mt-3 text-xs text-slate-500">Total for the period: {formatMoney(data.totals.revenue)} ({formatMoney(data.totals.prev_revenue)} in {data.previous.label}).</p>
                    </Card>
                </div>
            )}
        </PageShell>
    );
}

export default function CustomersReportPage() {
    return (
        <Suspense fallback={<Spinner />}>
            <CustomersReportContent />
        </Suspense>
    );
}
