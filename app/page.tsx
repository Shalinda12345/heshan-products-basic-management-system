'use client';

import { useEffect, useState, useRef } from 'react';
import {
    AreaChart, Area, BarChart, Bar, LineChart, Line,
    PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────
interface ChartPoint {
    label: string;
    sales: number;
    expenses: number;
    profit: number;
}

interface KPIs {
    totalSales: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;
}

interface ExpenseCategory {
    name: string;
    value: number;
}

interface TopCustomer {
    name: string;
    total: number;
}

interface DashboardData {
    period: string;
    chartData: ChartPoint[];
    kpis: KPIs;
    expenseBreakdown: ExpenseCategory[];
    topCustomers: TopCustomer[];
}

// ─── Period config ────────────────────────────────────────────────────────────
const PERIODS = [
    { key: 'day',   label: 'Today' },
    { key: 'week',  label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'year',  label: 'This Year' },
    { key: 'multi', label: 'Multi-Year' },
];

// ─── Pie chart colour palette ─────────────────────────────────────────────────
const PIE_COLORS = [
    '#6366f1', '#3b82f6', '#0ea5e9', '#10b981',
    '#f59e0b', '#f97316', '#ef4444', '#a855f7',
];

// ─── Number helpers ───────────────────────────────────────────────────────────
function fmt(n: number) {
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
    return n.toFixed(2);
}

function fmtFull(n: number) {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// ─── Animated counter ─────────────────────────────────────────────────────────
// FIX 1: initialise from `target` (not 0) so the card never starts at zero.
// FIX 2: store the rAF handle and cancel it in cleanup so two animations
//         can never run in parallel and fight each other (causing shuffling).
// FIX 3: update prevRef BEFORE the animation loop so that if target changes
//         mid-flight the next animation starts from the visually correct place.
function useAnimatedCount(target: number, duration = 900) {
    const [display, setDisplay] = useState(target);
    const prevRef = useRef(target);
    useEffect(() => {
        const start = prevRef.current;
        const diff  = target - start;
        if (diff === 0) return;
        // Commit the destination immediately so a rapid re-render starts from here
        prevRef.current = target;
        let startTime: number | null = null;
        let frameId = 0;
        const step = (ts: number) => {
            if (!startTime) startTime = ts;
            const progress = Math.min((ts - startTime) / duration, 1);
            const eased    = 1 - Math.pow(1 - progress, 3);
            setDisplay(start + diff * eased);
            if (progress < 1) {
                frameId = requestAnimationFrame(step);
            } else {
                setDisplay(target);
            }
        };
        frameId = requestAnimationFrame(step);
        // Cancel the old loop before the next target arrives
        return () => cancelAnimationFrame(frameId);
    }, [target, duration]);
    return display;
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{name:string;value:number;color:string}>; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: 'rgba(15,23,42,0.92)',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 12,
            padding: '10px 14px',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
            <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{label}</p>
            {payload.map((p) => (
                <p key={p.name} style={{ color: p.color, fontSize: 13, margin: '2px 0', fontWeight: 600 }}>
                    {p.name}: <span style={{ color: '#f1f5f9' }}>LKR {fmtFull(p.value)}</span>
                </p>
            ))}
        </div>
    );
}

// ─── Pie custom label ─────────────────────────────────────────────────────────
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
    cx: number; cy: number; midAngle: number;
    innerRadius: number; outerRadius: number; percent: number;
}) {
    if (percent < 0.04) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
        <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
            {`${(percent * 100).toFixed(0)}%`}
        </text>
    );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
// `isLoading` shows a shimmer overlay instead of zeroing the value out.
function KpiCard({ title, value, prefix, suffix, color, icon, trend, isLoading }: {
    title: string; value: number; prefix?: string; suffix?: string;
    color: string; icon: string; trend?: string; isLoading?: boolean;
}) {
    const animated = useAnimatedCount(value);
    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(15,23,42,0.9) 0%, rgba(30,41,59,0.9) 100%)',
            border: `1px solid ${color}33`,
            borderRadius: 20,
            padding: '24px 28px',
            position: 'relative',
            overflow: 'hidden',
            backdropFilter: 'blur(12px)',
            transition: 'transform 0.2s, box-shadow 0.2s',
        }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 16px 40px ${color}22`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
        >
            {/* Glow blob */}
            <div style={{
                position: 'absolute', top: -30, right: -30, width: 120, height: 120,
                background: color, borderRadius: '50%', opacity: 0.08, filter: 'blur(30px)',
            }} />
            {/* FIX: shimmer overlay while loading — value stays visible but dimmed.
                This prevents the number from bouncing through 0 on every period switch. */}
            {isLoading && (
                <div style={{
                    position: 'absolute', inset: 0, borderRadius: 20, zIndex: 2,
                    background: 'linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.08) 50%, transparent 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.4s ease-in-out infinite',
                    pointerEvents: 'none',
                }} />
            )}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                <p style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</p>
                <span style={{
                    background: `${color}22`, border: `1px solid ${color}44`,
                    borderRadius: 10, padding: '6px 10px', fontSize: 20,
                }}>{icon}</span>
            </div>
            <p style={{ color: '#f1f5f9', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', opacity: isLoading ? 0.5 : 1, transition: 'opacity 0.3s' }}>
                {prefix}<span>{fmt(animated)}</span>{suffix}
            </p>
            {trend && <p style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>{trend}</p>}
        </div>
    );
}

// ─── Section card wrapper ─────────────────────────────────────────────────────
function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.9) 100%)',
            border: '1px solid rgba(99,102,241,0.15)',
            borderRadius: 24,
            padding: '28px 32px',
            backdropFilter: 'blur(12px)',
        }}>
            <div style={{ marginBottom: 24 }}>
                <h2 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h2>
                {subtitle && <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>{subtitle}</p>}
            </div>
            {children}
        </div>
    );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function Home() {
    const [period, setPeriod]       = useState('month');
    const [years, setYears]         = useState(2);
    const [data, setData]           = useState<DashboardData | null>(null);
    const [loading, setLoading]     = useState(true);
    const [lastUpdated, setLastUpdated] = useState('');
    // A counter bumped by the Refresh button — causes the effect to re-run
    const [refreshTick, setRefreshTick] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        // THE ROOT CAUSE FIX:
        // Declare local `cancelled` variable so it is scoped to this specific effect execution.
        // Without `let`, this variable becomes a shared global (or throws a ReferenceError in strict mode),
        // which breaks state updates when switching periods.
        let cancelled = false;

        const run = async () => {
            // FIX: Do NOT clear data here. Keeping the previous period's values
            // means KPI cards animate directly old→new instead of old→0→new,
            // which was the visible "shuffling" effect. The loading shimmer on
            // the KPI cards signals to the user that values are being updated.
            setLoading(true);
            try {
                const p  = period === 'multi' ? 'multi' : period;
                const yr = period === 'multi' ? years : 1;
                const res = await fetch(
                    `/api/dashboard/summary?period=${p}&years=${yr}&_t=${Date.now()}`,
                    { signal: controller.signal, cache: 'no-store' }
                );
                if (!res.ok) throw new Error(`API returned ${res.status}`);
                const json = await res.json();
                // Guard: only write state if this effect is still the active one
                if (!cancelled) {
                    setData(json);
                    setLastUpdated(new Date().toLocaleTimeString());
                }
            } catch (e) {
                if (e instanceof Error && e.name !== 'AbortError') {
                    console.error('Dashboard fetch failed:', e);
                }
            } finally {
                // Guard: do NOT call setLoading(false) if a newer effect has
                // already taken ownership — this is what caused the shuffling.
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        run();

        return () => {
            cancelled = true;   // prevent stale state writes from this effect
            controller.abort(); // cancel the in-flight request
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [period, years, refreshTick]);

    // Current date header
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const kpis = data?.kpis;
    const chartData = data?.chartData ?? [];

    // ─── Profit gradient stops for area chart
    const hasNegative = chartData.some(d => d.profit < 0);

    return (
        <main style={{ minHeight: '100vh', background: '#060d1a', padding: '32px 24px 64px' }}>
            {/* ── Background grid ── */}
            <div style={{
                position: 'fixed', inset: 0, zIndex: 0,
                backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.12) 0%, transparent 70%)',
                pointerEvents: 'none',
            }} />

            <div style={{ maxWidth: 1400, margin: '0 auto', position: 'relative', zIndex: 1 }}>

                {/* ═══ Header ═════════════════════════════════════════════════ */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 40 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                            <div style={{
                                width: 10, height: 10, borderRadius: '50%',
                                background: '#10b981', boxShadow: '0 0 8px #10b981',
                                animation: 'pulse 2s infinite',
                            }} />
                            <span style={{ color: '#10b981', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Live Dashboard</span>
                        </div>
                        <h1 style={{ color: '#f1f5f9', fontSize: 36, fontWeight: 900, margin: 0, letterSpacing: '-0.03em' }}>
                            Business Intelligence
                        </h1>
                        <p style={{ color: '#475569', fontSize: 15, margin: '6px 0 0' }}>{dateStr}</p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {lastUpdated && (
                            <span style={{ color: '#475569', fontSize: 13 }}>Updated {lastUpdated}</span>
                        )}
                        <button
                            onClick={() => setRefreshTick(t => t + 1)}
                            disabled={loading}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                                color: '#a5b4fc', borderRadius: 12, padding: '10px 18px',
                                fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s', opacity: loading ? 0.6 : 1,
                            }}
                            onMouseEnter={e => { if (!loading) (e.currentTarget).style.background = 'rgba(99,102,241,0.25)'; }}
                            onMouseLeave={e => { (e.currentTarget).style.background = 'rgba(99,102,241,0.15)'; }}
                        >
                            <span style={{ display: 'inline-block', animation: loading ? 'spin 1s linear infinite' : 'none' }}>↻</span>
                            {loading ? 'Loading...' : 'Refresh'}
                        </button>
                    </div>
                </div>

                {/* ═══ Period Selector ═════════════════════════════════════════ */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 40 }}>
                    <span style={{ color: '#64748b', fontSize: 13, fontWeight: 600, marginRight: 4 }}>TIME PERIOD</span>
                    {PERIODS.map(p => (
                        <button
                            key={p.key}
                            onClick={() => setPeriod(p.key)}
                            style={{
                                padding: '8px 18px',
                                borderRadius: 50,
                                border: period === p.key ? '1px solid rgba(99,102,241,0.6)' : '1px solid rgba(255,255,255,0.08)',
                                background: period === p.key
                                    ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
                                    : 'rgba(255,255,255,0.04)',
                                color: period === p.key ? '#fff' : '#94a3b8',
                                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: period === p.key ? '0 4px 16px rgba(99,102,241,0.35)' : 'none',
                            }}
                        >
                            {p.label}
                        </button>
                    ))}

                    {/* Multi-year input */}
                    {period === 'multi' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '6px 16px' }}>
                            <span style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>Years:</span>
                            <button
                                onClick={() => setYears(y => Math.max(2, y - 1))}
                                style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#94a3b8', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 16, fontWeight: 700 }}
                            >−</button>
                            <span style={{ color: '#f1f5f9', fontWeight: 800, fontSize: 18, minWidth: 24, textAlign: 'center' }}>{years}</span>
                            <button
                                onClick={() => setYears(y => Math.min(10, y + 1))}
                                style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#94a3b8', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 16, fontWeight: 700 }}
                            >+</button>
                        </div>
                    )}
                </div>

                {/* ═══ KPI Cards ═══════════════════════════════════════════════ */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 40 }}>
                    <KpiCard title="Total Revenue"  value={kpis?.totalSales     ?? 0} icon="💰" color="#3b82f6" prefix="LKR " trend="Gross sales in selected period" isLoading={loading} />
                    <KpiCard title="Total Expenses" value={kpis?.totalExpenses  ?? 0} icon="📊" color="#ef4444" prefix="LKR " trend="All costs in selected period"    isLoading={loading} />
                    <KpiCard title="Net Profit"     value={kpis?.netProfit      ?? 0} icon="📈" color="#10b981" prefix="LKR " trend="Revenue minus expenses"           isLoading={loading} />
                    <KpiCard title="Profit Margin"  value={kpis?.profitMargin   ?? 0} icon="🎯" color="#a855f7" suffix="%"   trend="Net profit as % of revenue"      isLoading={loading} />
                </div>

                {/* ═══ Net Profit Chart (full width) ══════════════════════════ */}
                <div style={{ marginBottom: 28 }}>
                    <ChartCard title="Net Profit Overview" subtitle={`Profit/loss trend — ${PERIODS.find(p => p.key === period)?.label}${period === 'multi' ? ` (${years} years)` : ''}`}>
                        {loading ? <LoadingSkeleton height={300} /> : (
                            <ResponsiveContainer width="100%" height={300}>
                                <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%"  stopColor="#10b981" stopOpacity={0.4} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                                        </linearGradient>
                                        <linearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.4} />
                                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} tickLine={false} interval="preserveStartEnd" />
                                    <YAxis tickFormatter={(v) => `${fmt(v)}`} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} width={70} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area type="monotone" dataKey="profit" name="Net Profit" stroke={hasNegative ? '#f97316' : '#10b981'} strokeWidth={2.5} fill={hasNegative ? 'url(#lossGrad)' : 'url(#profitGrad)'} dot={false} activeDot={{ r: 5, fill: hasNegative ? '#f97316' : '#10b981' }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>
                </div>

                {/* ═══ Sales vs Expenses + Sales Trend ═══════════════════════ */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
                    {/* Sales vs Expenses Bar */}
                    <ChartCard title="Sales vs Expenses" subtitle="Side-by-side comparison">
                        {loading ? <LoadingSkeleton height={260} /> : (
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barCategoryGap="30%">
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                                    <YAxis tickFormatter={fmt} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: 12, fontSize: 13, color: '#94a3b8' }} />
                                    <Bar dataKey="sales"    name="Sales"    fill="#3b82f6" radius={[6,6,0,0]} maxBarSize={24} />
                                    <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[6,6,0,0]} maxBarSize={24} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>

                    {/* Sales Trend Line */}
                    <ChartCard title="Sales Trend" subtitle="Revenue trajectory over time">
                        {loading ? <LoadingSkeleton height={260} /> : (
                            <ResponsiveContainer width="100%" height={260}>
                                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.35} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                                    <YAxis tickFormatter={fmt} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area type="monotone" dataKey="sales" name="Sales" stroke="#3b82f6" strokeWidth={2.5} fill="url(#salesGrad)" dot={false} activeDot={{ r: 5, fill: '#3b82f6' }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>
                </div>

                {/* ═══ Expense Trend + Expense Breakdown ═════════════════════ */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
                    {/* Expense Trend */}
                    <ChartCard title="Expense Trend" subtitle="Cost trajectory over time">
                        {loading ? <LoadingSkeleton height={260} /> : (
                            <ResponsiveContainer width="100%" height={260}>
                                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.35} />
                                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.01} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                                    <YAxis tickFormatter={fmt} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2.5} fill="url(#expGrad)" dot={false} activeDot={{ r: 5, fill: '#ef4444' }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>

                    {/* Expense Breakdown Donut */}
                    <ChartCard title="Expense Breakdown" subtitle="Spending by category">
                        {loading ? <LoadingSkeleton height={260} /> : (
                            data?.expenseBreakdown && data.expenseBreakdown.length > 0 ? (
                                <ResponsiveContainer width="100%" height={260}>
                                    <PieChart>
                                        <Pie
                                            data={data.expenseBreakdown}
                                            cx="50%" cy="50%"
                                            innerRadius={60} outerRadius={100}
                                            dataKey="value" nameKey="name"
                                            labelLine={false}
                                            label={PieLabel as unknown as boolean}
                                        >
                                            {data.expenseBreakdown.map((_, i) => (
                                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="rgba(0,0,0,0.2)" strokeWidth={2} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(v) => [`LKR ${fmtFull(Number(v))}`, '']} contentStyle={{ background: 'rgba(15,23,42,0.92)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 12, color: '#f1f5f9' }} />
                                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyState message="No expense data for this period" />
                            )
                        )}
                    </ChartCard>
                </div>

                {/* ═══ Profit vs Sales vs Expenses Line Chart ═════════════════ */}
                <div style={{ marginBottom: 28 }}>
                    <ChartCard title="Combined Performance" subtitle="Sales, expenses and profit in one view">
                        {loading ? <LoadingSkeleton height={280} /> : (
                            <ResponsiveContainer width="100%" height={280}>
                                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                                    <YAxis tickFormatter={fmt} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} width={70} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: 14, fontSize: 13, color: '#94a3b8' }} />
                                    <Line type="monotone" dataKey="sales"    name="Sales"    stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                                    <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 5 }} strokeDasharray="5 3" />
                                    <Line type="monotone" dataKey="profit"   name="Net Profit" stroke="#10b981" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>
                </div>

                {/* ═══ Top Customers Table ═════════════════════════════════════ */}
                <div style={{ marginBottom: 28 }}>
                    <ChartCard title="Top Customers by Revenue" subtitle={`Highest-value customers — ${PERIODS.find(p => p.key === period)?.label}`}>
                        {loading ? <LoadingSkeleton height={240} /> : (
                            data?.topCustomers && data.topCustomers.length > 0 ? (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                <th style={thStyle}>#</th>
                                                <th style={thStyle}>Customer</th>
                                                <th style={{ ...thStyle, textAlign: 'right' }}>Revenue (LKR)</th>
                                                <th style={{ ...thStyle, textAlign: 'right' }}>Share</th>
                                                <th style={{ ...thStyle, textAlign: 'right' }}>Bar</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.topCustomers.map((c, i) => {
                                                const maxVal = data.topCustomers[0]?.total ?? 1;
                                                const share = (c.total / (data.kpis.totalSales || 1) * 100);
                                                const barPct = (c.total / maxVal * 100);
                                                return (
                                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.2s' }}
                                                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(99,102,241,0.06)'}
                                                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}
                                                    >
                                                        <td style={tdStyle}>
                                                            <span style={{
                                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                                width: 28, height: 28, borderRadius: '50%',
                                                                background: i === 0 ? 'rgba(251,191,36,0.2)' : i === 1 ? 'rgba(148,163,184,0.15)' : i === 2 ? 'rgba(180,120,80,0.15)' : 'rgba(255,255,255,0.06)',
                                                                color: i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : i === 2 ? '#b47250' : '#475569',
                                                                fontSize: 12, fontWeight: 700,
                                                            }}>{i + 1}</span>
                                                        </td>
                                                        <td style={tdStyle}>
                                                            <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{c.name}</span>
                                                        </td>
                                                        <td style={{ ...tdStyle, textAlign: 'right', color: '#3b82f6', fontWeight: 700, fontFamily: 'monospace' }}>
                                                            {fmtFull(c.total)}
                                                        </td>
                                                        <td style={{ ...tdStyle, textAlign: 'right', color: '#64748b', fontSize: 13 }}>
                                                            {share.toFixed(1)}%
                                                        </td>
                                                        <td style={{ ...tdStyle, width: 140 }}>
                                                            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                                                                <div style={{
                                                                    width: `${barPct}%`, height: '100%', borderRadius: 4,
                                                                    background: 'linear-gradient(90deg, #6366f1, #3b82f6)',
                                                                    transition: 'width 0.8s ease',
                                                                }} />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <EmptyState message="No customer data for this period" />
                            )
                        )}
                    </ChartCard>
                </div>

                {/* ═══ Financial Summary Table ═════════════════════════════════ */}
                <div>
                    <ChartCard title="Period Financial Summary" subtitle="Key financial metrics at a glance">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                            {[
                                { label: 'Gross Revenue', value: `LKR ${fmtFull(kpis?.totalSales ?? 0)}`, color: '#3b82f6', icon: '💰' },
                                { label: 'Total Expenses', value: `LKR ${fmtFull(kpis?.totalExpenses ?? 0)}`, color: '#ef4444', icon: '📉' },
                                { label: 'Net Profit', value: `LKR ${fmtFull(kpis?.netProfit ?? 0)}`, color: (kpis?.netProfit ?? 0) >= 0 ? '#10b981' : '#f97316', icon: (kpis?.netProfit ?? 0) >= 0 ? '✅' : '⚠️' },
                                { label: 'Profit Margin', value: `${(kpis?.profitMargin ?? 0).toFixed(1)}%`, color: '#a855f7', icon: '🎯' },
                                { label: 'Expense Ratio', value: `${kpis?.totalSales ? ((kpis.totalExpenses / kpis.totalSales) * 100).toFixed(1) : '0.0'}%`, color: '#f59e0b', icon: '📊' },
                                { label: 'Unique Customers', value: `${data?.topCustomers?.length ?? 0}`, color: '#0ea5e9', icon: '👥' },
                            ].map((item) => (
                                <div key={item.label} style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${item.color}22`,
                                    borderRadius: 16, padding: '16px 20px',
                                    display: 'flex', alignItems: 'center', gap: 14,
                                }}>
                                    <span style={{ fontSize: 24 }}>{item.icon}</span>
                                    <div>
                                        <p style={{ color: '#64748b', fontSize: 12, fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</p>
                                        <p style={{ color: item.color, fontSize: 20, fontWeight: 800, margin: '4px 0 0', letterSpacing: '-0.02em' }}>{item.value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ChartCard>
                </div>

            </div>

            {/* ── Keyframes ── */}
            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
                @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
            `}</style>
        </main>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const thStyle: React.CSSProperties = {
    color: '#475569', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: '0.08em', padding: '0 16px 14px', textAlign: 'left', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
    color: '#94a3b8', fontSize: 14, padding: '12px 16px',
};

function LoadingSkeleton({ height }: { height: number }) {
    return (
        <div style={{
            height, borderRadius: 12,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
        }}>
            <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
        </div>
    );
}

function EmptyState({ message }: { message: string }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 180, gap: 12 }}>
            <span style={{ fontSize: 40 }}>📭</span>
            <p style={{ color: '#475569', fontSize: 14, fontWeight: 500 }}>{message}</p>
        </div>
    );
}
