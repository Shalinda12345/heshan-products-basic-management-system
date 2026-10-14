'use client';

import { Suspense } from 'react';
import ReportsNavigation from '@/app/components/reports/reports-navigation';
import { PeriodBar, usePeriod } from '@/app/components/reports/period';
import { CHART, MonthlyTrendChart, RankingChart } from '@/app/components/reports/charts';
import { StatTile } from '@/app/components/reports/stat-tile';
import { PageHeader, PageShell, Card, tableClasses as t } from '@/app/components/ui/page-shell';
import { Button } from '@/app/components/ui/form';
import { ChangeIndicator, Notice, Spinner } from '@/app/components/ui/feedback';
import { queryString } from '@/app/lib/api-client';
import { downloadCsv } from '@/app/lib/csv';
import { formatAmount, formatMoney, formatPercent } from '@/app/lib/format';
import { useResource } from '@/app/lib/use-resource';

interface ExpensesReport {
    period: { label: string };
    previous: { label: string };
    categories: { name: string; total: number; count: number; share: number; prev_total: number; change: number | null }[];
    employees: { employee_name: string; total: number; by_category: Record<string, number> }[];
    monthly: { month: string; label: string; total: number }[];
    totals: { total: number; prev_total: number; change: number | null };
}

function ExpensesReportContent() {
    const period = usePeriod();
    const report = useResource<ExpensesReport>(`/api/reports/expenses${queryString(period.range)}`);
    const data = report.data;

    const ranked = (data?.categories ?? []).filter((c) => c.total > 0).slice(0, 10).map((c) => ({ name: c.name, value: c.total }));
    const biggest = data?.categories.find((c) => c.total > 0);
    const salaryCategories = [...new Set((data?.employees ?? []).flatMap((e) => Object.keys(e.by_category)))].sort();
    const staffCost = (data?.employees ?? []).reduce((sum, e) => sum + e.total, 0);

    const exportCsv = () => data && downloadCsv(`expenses-by-category-${data.period.label.replace(/\s+/g, '-')}.csv`, data.categories, [
        { header: 'Category', value: (r) => r.name },
        { header: 'Amount (Rs.)', value: (r) => r.total.toFixed(2) },
        { header: 'Entries', value: (r) => r.count },
        { header: 'Share (%)', value: (r) => r.share },
        { header: 'Previous amount (Rs.)', value: (r) => r.prev_total.toFixed(2) },
        { header: 'Change (%)', value: (r) => r.change },
    ]);

    return (
        <PageShell nav={<ReportsNavigation />}>
            <PageHeader
                title="Expense analysis"
                description="Where the money goes, what is rising, and what each employee was paid."
            />
            <PeriodBar period={period} comparedWith={data?.previous.label} />

            {report.error && <Notice tone="error" title="Could not build the report">{report.error}</Notice>}
            {!data ? (report.loading && <Spinner label="Building the report…" />) : (
                <div className={`space-y-8 transition-opacity ${report.loading ? 'opacity-60' : ''}`}>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatTile label="Total expenses" value={formatMoney(data.totals.total)} change={data.totals.change} upIsGood={false} previous={formatMoney(data.totals.prev_total)} />
                        <StatTile label="Largest cost" value={biggest ? biggest.name : '—'} hint={biggest ? `${formatMoney(biggest.total)} · ${formatPercent(biggest.share, 0)} of expenses` : undefined} />
                        <StatTile label="Paid to employees" value={formatMoney(staffCost)} hint="Salaries, advances and loans" />
                        <StatTile label="Categories used" value={String(data.categories.filter((c) => c.total > 0).length)} />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                        <Card title="Expenses by category" description={data.period.label}>
                            {ranked.length ? <RankingChart data={ranked} name="Expenses" color={CHART.series2} /> : <p className="py-10 text-center text-sm text-slate-400">No expenses in this period.</p>}
                        </Card>
                        <Card title="Expenses by month" description="The 12 months up to the end of the period">
                            <MonthlyTrendChart data={data.monthly.map((m) => ({ label: m.label, value: m.total }))} name="Expenses" color={CHART.series2} />
                        </Card>
                    </div>

                    <Card
                        title="Categories"
                        description={`${data.period.label} against ${data.previous.label}`}
                        actions={<Button variant="secondary" size="sm" onClick={exportCsv}>⬇ CSV</Button>}
                    >
                        <div className={t.wrapper}>
                            <table className={t.table} aria-label="Expenses by category">
                                <thead>
                                    <tr className={t.head}>
                                        <th className={t.th}>Category</th>
                                        <th className={`${t.th} text-right`}>Amount</th>
                                        <th className={`${t.th} text-right`}>Entries</th>
                                        <th className={`${t.th} text-right`}>Share</th>
                                        <th className={`${t.th} text-right`}>Before</th>
                                        <th className={`${t.th} text-right`}>Change</th>
                                    </tr>
                                </thead>
                                <tbody className={t.body}>
                                    {data.categories.length === 0 ? (
                                        <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-400">No expenses in either period.</td></tr>
                                    ) : data.categories.map((c) => (
                                        <tr key={c.name} className={t.row}>
                                            <td className={`${t.td} font-semibold text-white`}>{c.name}</td>
                                            <td className={`${t.num} font-bold text-white`}>{formatAmount(c.total)}</td>
                                            <td className={t.num}>{c.count}</td>
                                            <td className={t.num}>{formatPercent(c.share)}</td>
                                            <td className={`${t.num} text-slate-500`}>{formatAmount(c.prev_total)}</td>
                                            <td className={`${t.td} text-right`}><ChangeIndicator change={c.change} upIsGood={false} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    <Card title="Payments to employees" description={data.period.label}>
                        {data.employees.length === 0 ? (
                            <p className="py-6 text-center text-sm text-slate-400">No salary payments in this period.</p>
                        ) : (
                            <div className={t.wrapper}>
                                <table className={t.table} aria-label="Payments to employees">
                                    <thead>
                                        <tr className={t.head}>
                                            <th className={t.th}>Employee</th>
                                            {salaryCategories.map((c) => <th key={c} className={`${t.th} text-right`}>{c}</th>)}
                                            <th className={`${t.th} text-right`}>Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className={t.body}>
                                        {data.employees.map((e) => (
                                            <tr key={e.employee_name} className={t.row}>
                                                <td className={`${t.td} font-semibold text-white`}>{e.employee_name}</td>
                                                {salaryCategories.map((c) => <td key={c} className={t.num}>{e.by_category[c] ? formatAmount(e.by_category[c]) : <span className="text-slate-600">—</span>}</td>)}
                                                <td className={`${t.num} font-bold text-white`}>{formatAmount(e.total)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </div>
            )}
        </PageShell>
    );
}

export default function ExpensesReportPage() {
    return (
        <Suspense fallback={<Spinner />}>
            <ExpensesReportContent />
        </Suspense>
    );
}
