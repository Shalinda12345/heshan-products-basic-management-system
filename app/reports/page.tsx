'use client';

import ReportsNavigation from '@/app/components/reports/reports-navigation';
import { PeriodBar, usePeriod } from '@/app/components/reports/period';
import { ProfitChart, RevenueExpenseChart } from '@/app/components/reports/charts';
import { StatTile } from '@/app/components/reports/stat-tile';
import { PageHeader, PageShell, Card, tableClasses as t } from '@/app/components/ui/page-shell';
import { Button } from '@/app/components/ui/form';
import { ChangeIndicator, Notice, Spinner } from '@/app/components/ui/feedback';
import { queryString } from '@/app/lib/api-client';
import { downloadCsv } from '@/app/lib/csv';
import { formatAmount, formatChange, formatMoney, formatMoneyChange, formatPercent, formatQty } from '@/app/lib/format';
import { useResource } from '@/app/lib/use-resource';

interface Totals {
    revenue: number;
    expenses: number;
    profit: number;
    margin: number | null;
    invoices: number;
    avg_invoice: number;
    customers: number;
    units_sold: number;
    returns_value: number;
    returns_count: number;
}

interface Overview {
    period: { from: string; to: string; label: string };
    previous: { from: string; to: string; label: string };
    current: Totals;
    prior: Totals;
    changes: Record<'revenue' | 'expenses' | 'profit' | 'invoices' | 'avg_invoice' | 'customers' | 'units_sold', number | null>;
    monthly: { month: string; label: string; revenue: number; expenses: number; profit: number }[];
    expense_categories: { name: string; current: number; previous: number; change: number | null }[];
}

// A few plain sentences about what changed, for readers who won't study the tables
function insights(data: Overview): string[] {
    const { current: c, prior: p, changes, previous } = data;
    const lines: string[] = [];
    if (c.revenue > 0 || p.revenue > 0) {
        lines.push(changes.revenue === null
            ? `Revenue was ${formatMoney(c.revenue)} (nothing was sold in ${previous.label}).`
            : Math.round(changes.revenue * 10) === 0
                ? `Revenue was ${formatMoney(c.revenue)}, about the same as in ${previous.label} (${formatMoney(p.revenue)}).`
                : `Revenue was ${formatMoney(c.revenue)}, ${changes.revenue > 0 ? 'up' : 'down'} ${formatChange(Math.abs(changes.revenue)).replace('+', '')} on ${previous.label} (${formatMoney(p.revenue)}).`);
    }
    lines.push(c.profit >= 0
        ? `The business made a net profit of ${formatMoney(c.profit)}${c.margin !== null ? `, keeping ${formatPercent(c.margin)} of every rupee of sales` : ''}.`
        : `The business made a loss of ${formatMoney(Math.abs(c.profit))}: expenses were ${formatMoney(c.expenses - c.revenue)} more than revenue.`);
    if (changes.expenses !== null && changes.revenue !== null && changes.expenses - changes.revenue > 10) {
        lines.push(`Expenses grew faster than revenue (${formatChange(changes.expenses)} against ${formatChange(changes.revenue)}).`);
    }
    const top = data.expense_categories[0];
    if (top && c.expenses > 0 && top.current > 0) {
        lines.push(`${top.name} was the largest cost: ${formatMoney(top.current)} (${formatPercent((top.current / c.expenses) * 100, 0)} of all expenses).`);
    }
    const jump = [...data.expense_categories].sort((a, b) => (b.current - b.previous) - (a.current - a.previous))[0];
    if (jump && jump.current - jump.previous > 0 && jump !== top) {
        lines.push(`${jump.name} rose the most: ${formatMoney(jump.current - jump.previous)} more than in ${previous.label}.`);
    }
    if (c.returns_count > 0) {
        lines.push(`${c.returns_count} return${c.returns_count === 1 ? '' : 's'} took ${formatMoney(c.returns_value)} off sales.`);
    }
    return lines;
}

export default function ProfitAndLossPage() {
    const period = usePeriod();
    const report = useResource<Overview>(`/api/reports/overview${queryString(period.range)}`);
    const data = report.data;

    const exportMonthly = () => data && downloadCsv(`profit-and-loss-12-months-to-${data.period.to}.csv`, data.monthly, [
        { header: 'Month', value: (r) => r.month },
        { header: 'Revenue (Rs.)', value: (r) => r.revenue.toFixed(2) },
        { header: 'Expenses (Rs.)', value: (r) => r.expenses.toFixed(2) },
        { header: 'Net profit (Rs.)', value: (r) => r.profit.toFixed(2) },
    ]);

    return (
        <PageShell nav={<ReportsNavigation />}>
            <PageHeader
                title="Profit & loss"
                description="Money in, money out and what was left, compared with the period before. Voided invoices and expenses are not counted."
            />
            <PeriodBar period={period} comparedWith={data?.previous.label} />

            {report.error && <Notice tone="error" title="Could not build the report">{report.error}</Notice>}
            {!data ? (report.loading && <Spinner label="Building the report…" />) : (
                <div className={`space-y-8 transition-opacity ${report.loading ? 'opacity-60' : ''}`}>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatTile label="Revenue" value={formatMoney(data.current.revenue)} change={data.changes.revenue} previous={formatMoney(data.prior.revenue)} />
                        <StatTile label="Expenses" value={formatMoney(data.current.expenses)} change={data.changes.expenses} upIsGood={false} previous={formatMoney(data.prior.expenses)} />
                        <StatTile
                            label="Net profit"
                            value={formatMoney(data.current.profit)}
                            change={data.changes.profit ?? data.current.profit - data.prior.profit}
                            format={data.changes.profit === null ? formatMoneyChange : undefined}
                            previous={formatMoney(data.prior.profit)}
                            emphasis={data.current.profit < 0 ? 'bad' : null}
                        />
                        <StatTile
                            label="Profit margin"
                            value={formatPercent(data.current.margin)}
                            hint={`${formatPercent(data.prior.margin)} in ${data.previous.label}`}
                            emphasis={data.current.margin !== null && data.current.margin < 0 ? 'bad' : null}
                        />
                        <StatTile label="Invoices" value={data.current.invoices.toLocaleString()} change={data.changes.invoices} previous={data.prior.invoices.toLocaleString()} />
                        <StatTile label="Average invoice" value={formatMoney(data.current.avg_invoice)} change={data.changes.avg_invoice} previous={formatMoney(data.prior.avg_invoice)} />
                        <StatTile label="Customers who bought" value={data.current.customers.toLocaleString()} change={data.changes.customers} previous={data.prior.customers.toLocaleString()} />
                        <StatTile label="Units sold" value={formatQty(data.current.units_sold)} change={data.changes.units_sold} previous={formatQty(data.prior.units_sold)} />
                    </div>

                    <Card title="In short">
                        <ul className="space-y-2 text-sm text-slate-200">
                            {insights(data).map((line) => (
                                <li key={line} className="flex gap-2.5"><span className="text-slate-500" aria-hidden>•</span>{line}</li>
                            ))}
                        </ul>
                    </Card>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                        <Card title="Revenue and expenses" description="The 12 months up to the end of the period">
                            <RevenueExpenseChart data={data.monthly} />
                        </Card>
                        <Card title="Net profit by month" description="Revenue minus expenses; losses below the line">
                            <ProfitChart data={data.monthly} />
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                        <Card
                            title="Month by month"
                            className="xl:col-span-7"
                            actions={<Button variant="secondary" size="sm" onClick={exportMonthly}>⬇ CSV</Button>}
                        >
                            <div className={t.wrapper}>
                                <table className={t.table} aria-label="Monthly profit and loss">
                                    <thead>
                                        <tr className={t.head}>
                                            <th className={t.th}>Month</th>
                                            <th className={`${t.th} text-right`}>Revenue</th>
                                            <th className={`${t.th} text-right`}>Expenses</th>
                                            <th className={`${t.th} text-right`}>Net profit</th>
                                            <th className={`${t.th} text-right`}>Margin</th>
                                        </tr>
                                    </thead>
                                    <tbody className={t.body}>
                                        {[...data.monthly].reverse().map((m) => (
                                            <tr key={m.month} className={t.row}>
                                                <td className={`${t.td} whitespace-nowrap font-semibold text-slate-200`}>{m.label}</td>
                                                <td className={t.num}>{formatAmount(m.revenue)}</td>
                                                <td className={t.num}>{formatAmount(m.expenses)}</td>
                                                <td className={`${t.num} font-bold ${m.profit < 0 ? 'text-rose-300' : 'text-white'}`}>{formatAmount(m.profit)}</td>
                                                <td className={t.num}>{m.revenue > 0 ? formatPercent((m.profit / m.revenue) * 100) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>

                        <Card title="Expenses by category" description={`${data.period.label} against ${data.previous.label}`} className="xl:col-span-5">
                            <div className={t.wrapper}>
                                <table className={t.table} aria-label="Expenses by category">
                                    <thead>
                                        <tr className={t.head}>
                                            <th className={t.th}>Category</th>
                                            <th className={`${t.th} text-right`}>This period</th>
                                            <th className={`${t.th} text-right`}>Before</th>
                                            <th className={`${t.th} text-right`}>Change</th>
                                        </tr>
                                    </thead>
                                    <tbody className={t.body}>
                                        {data.expense_categories.length === 0 ? (
                                            <tr><td colSpan={4} className="py-8 text-center text-sm text-slate-400">No expenses in either period.</td></tr>
                                        ) : data.expense_categories.map((c) => (
                                            <tr key={c.name} className={t.row}>
                                                <td className={`${t.td} font-semibold text-slate-200`}>{c.name}</td>
                                                <td className={t.num}>{formatAmount(c.current)}</td>
                                                <td className={`${t.num} text-slate-500`}>{formatAmount(c.previous)}</td>
                                                <td className={`${t.td} text-right`}><ChangeIndicator change={c.change} upIsGood={false} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>

                    <p className="text-xs text-slate-500">
                        Revenue is invoices net of returns. Expenses include everything recorded on the expense form (materials, salaries, bills and write-offs).
                    </p>
                </div>
            )}
        </PageShell>
    );
}
