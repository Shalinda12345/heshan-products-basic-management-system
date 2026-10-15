'use client';

// Report charts. Colours are the validated dark-surface palette (blue/orange for two series,
// blue/red for profit and loss); text always uses text colours, never the series colour.
import {
    Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
    type TooltipContentProps, type TooltipValueType,
} from 'recharts';
import { formatCompact, formatMoney } from '@/app/lib/format';

export const CHART = {
    series1: '#3987e5', // blue: revenue, single series
    series2: '#d95926', // orange: expenses
    positive: '#3987e5',
    negative: '#e66767',
    grid: '#1e293b',
    axis: '#334155',
    tick: '#94a3b8',
};

const tickStyle = { fill: CHART.tick, fontSize: 11 };

// One tooltip listing every series at the hovered point: value first, series name second, line key
function ChartTooltip({ active, payload, label }: TooltipContentProps<TooltipValueType, string | number>) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-xl border border-slate-700 bg-slate-950/95 px-3.5 py-2.5 shadow-xl shadow-black/40">
            <p className="mb-1.5 text-xs font-semibold text-slate-400">{label}</p>
            {payload.filter((p) => p.value !== null && p.value !== undefined).map((p) => (
                <p key={String(p.dataKey)} className="flex items-center gap-2 text-sm">
                    <span className="inline-block h-0.5 w-3 rounded" style={{ background: p.color }} aria-hidden />
                    <span className="font-bold text-white tabular-nums">{formatMoney(Number(p.value))}</span>
                    <span className="text-xs text-slate-400">{p.name}</span>
                </p>
            ))}
        </div>
    );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
    return (
        <ul className="mb-3 flex flex-wrap gap-4 text-xs text-slate-300" aria-label="Legend">
            {items.map((item) => (
                <li key={item.label} className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: item.color }} aria-hidden />
                    {item.label}
                </li>
            ))}
        </ul>
    );
}

// Revenue and expenses side by side for each month
export function RevenueExpenseChart({ data }: { data: { label: string; revenue: number; expenses: number }[] }) {
    return (
        <div>
            <Legend items={[{ label: 'Revenue', color: CHART.series1 }, { label: 'Expenses', color: CHART.series2 }]} />
            <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="label" tick={tickStyle} axisLine={{ stroke: CHART.axis }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tickFormatter={(v: number) => formatCompact(v)} tick={tickStyle} axisLine={false} tickLine={false} width={52} />
                    <Tooltip content={ChartTooltip} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
                    <Bar dataKey="revenue" name="Revenue" fill={CHART.series1} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="expenses" name="Expenses" fill={CHART.series2} radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

// Profit above the line in blue, losses below it in red (each bar rounded at its data end)
export function ProfitChart({ data }: { data: { label: string; profit: number }[] }) {
    const rows = data.map((d) => ({ label: d.label, gain: d.profit >= 0 ? d.profit : null, loss: d.profit < 0 ? d.profit : null }));
    return (
        <div>
            <Legend items={[{ label: 'Profit', color: CHART.positive }, { label: 'Loss', color: CHART.negative }]} />
            <ResponsiveContainer width="100%" height={240}>
                <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} stackOffset="sign" barCategoryGap="28%">
                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tickFormatter={(v: number) => formatCompact(v)} tick={tickStyle} axisLine={false} tickLine={false} width={52} />
                    <ReferenceLine y={0} stroke={CHART.axis} />
                    <Tooltip content={ChartTooltip} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
                    <Bar dataKey="gain" name="Profit" stackId="p" fill={CHART.positive} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="loss" name="Loss" stackId="p" fill={CHART.negative} radius={[0, 0, 4, 4]} maxBarSize={22} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

// A single measure over months (e.g. expenses), one colour
export function MonthlyTrendChart({ data, name, color = CHART.series1 }: { data: { label: string; value: number }[]; name: string; color?: string }) {
    return (
        <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tick={tickStyle} axisLine={{ stroke: CHART.axis }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tickFormatter={(v: number) => formatCompact(v)} tick={tickStyle} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={ChartTooltip} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
                <Bar dataKey="value" name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
        </ResponsiveContainer>
    );
}

// Ranked horizontal bars (top products, customers, categories) with the value at each bar's tip
export function RankingChart({ data, name, color = CHART.series1 }: { data: { name: string; value: number }[]; name: string; color?: string }) {
    const height = Math.max(120, data.length * 34 + 16);
    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 84, left: 0, bottom: 4 }} barCategoryGap="22%">
                <XAxis type="number" hide domain={[0, 'dataMax']} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#cbd5e1', fontSize: 12 }} axisLine={false} tickLine={false} width={150} />
                <Tooltip content={ChartTooltip} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
                <Bar dataKey="value" name={name} fill={color} radius={[0, 4, 4, 0]} maxBarSize={22}>
                    <LabelList dataKey="value" position="right" formatter={(v) => formatCompact(Number(v))} style={{ fill: '#cbd5e1', fontSize: 12, fontWeight: 600 }} />
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
