'use client';

import React, { useEffect, useState, useMemo } from 'react';
import MonthSelector, { MONTH_NAMES } from '@/app/components/ui/month-selector';

export interface ItemSummary {
    product_name: string;
    quantity: number;
    revenue: number;
    orders_count: number;
    avg_price: number;
    min_price: number;
    max_price: number;
    percentage_of_units: number;
    percentage_of_revenue: number;
}

export interface SummaryStats {
    totalUnitsSold: number;
    totalRevenue: number;
    totalProducts: number;
    topProduct: {
        product_name: string;
        quantity: number;
        revenue: number;
    } | null;
}

export interface ItemsSoldSummaryProps {
    timeframe?: 'daily' | 'weekly' | 'monthly' | 'custom';
    selectedYear?: number;
    selectedMonth?: number;
    selectedDate?: string;
    startDate?: string;
    endDate?: string;
    showTimeframeSelector?: boolean;
    title?: string;
    subtitle?: string;
    compact?: boolean;
}

export default function ItemsSoldSummary({
    timeframe: initialTimeframe = 'daily',
    selectedYear: propYear,
    selectedMonth: propMonth,
    selectedDate: propDate,
    startDate: propStartDate,
    endDate: propEndDate,
    showTimeframeSelector = false,
    title,
    subtitle,
    compact = false,
}: ItemsSoldSummaryProps) {
    const [currentTimeframe, setCurrentTimeframe] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>(initialTimeframe);
    const [year, setYear] = useState<number>(propYear ?? new Date().getFullYear());
    const [month, setMonth] = useState<number>(propMonth ?? new Date().getMonth() + 1);
    const [customStartDate, setCustomStartDate] = useState<string>(propStartDate ?? '');
    const [customEndDate, setCustomEndDate] = useState<string>(propEndDate ?? '');
    const [specificDate, setSpecificDate] = useState<string>(propDate ?? '');

    const [items, setItems] = useState<ItemSummary[]>([]);
    const [summary, setSummary] = useState<SummaryStats>({
        totalUnitsSold: 0,
        totalRevenue: 0,
        totalProducts: 0,
        topProduct: null,
    });
    const [dateRangeLabel, setDateRangeLabel] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [sortBy, setSortBy] = useState<'quantity-desc' | 'quantity-asc' | 'revenue-desc' | 'revenue-asc' | 'name'>('quantity-desc');

    // Sync props with state when parent props change
    useEffect(() => {
        if (initialTimeframe) setCurrentTimeframe(initialTimeframe);
    }, [initialTimeframe]);

    useEffect(() => {
        if (propYear !== undefined) setYear(propYear);
        if (propMonth !== undefined) setMonth(propMonth);
    }, [propYear, propMonth]);

    useEffect(() => {
        if (propDate !== undefined) setSpecificDate(propDate);
        if (propStartDate !== undefined) setCustomStartDate(propStartDate);
        if (propEndDate !== undefined) setCustomEndDate(propEndDate);
    }, [propDate, propStartDate, propEndDate]);

    // Fetch items summary
    useEffect(() => {
        let isCancelled = false;
        async function fetchSummary() {
            setLoading(true);
            try {
                const params = new URLSearchParams();
                params.append('timeframe', currentTimeframe);

                if (currentTimeframe === 'monthly' || currentTimeframe === 'custom') {
                    if (year) params.append('year', year.toString());
                    if (month) params.append('month', month.toString());
                }

                if (currentTimeframe === 'custom' && customStartDate && customEndDate) {
                    params.append('startDate', customStartDate);
                    params.append('endDate', customEndDate);
                }

                if (currentTimeframe === 'daily' && specificDate) {
                    params.append('date', specificDate);
                }

                const res = await fetch(`/api/sales/get-items-summary?${params.toString()}`, { cache: 'no-store' });
                if (!res.ok) throw new Error('Failed to fetch items summary');
                const data = await res.json();

                if (!isCancelled && data.success) {
                    setItems(data.items || []);
                    setSummary(data.summary || {
                        totalUnitsSold: 0,
                        totalRevenue: 0,
                        totalProducts: 0,
                        topProduct: null,
                    });
                    if (data.dateRange?.label) {
                        setDateRangeLabel(data.dateRange.label);
                    }
                }
            } catch (err) {
                console.error('Error loading items summary:', err);
            } finally {
                if (!isCancelled) setLoading(false);
            }
        }

        fetchSummary();
        return () => {
            isCancelled = true;
        };
    }, [currentTimeframe, year, month, customStartDate, customEndDate, specificDate]);

    // Filter and sort items
    const filteredAndSortedItems = useMemo(() => {
        let list = items.filter((item) =>
            item.product_name.toLowerCase().includes(searchQuery.toLowerCase())
        );

        return list.sort((a, b) => {
            switch (sortBy) {
                case 'quantity-desc':
                    return b.quantity - a.quantity;
                case 'quantity-asc':
                    return a.quantity - b.quantity;
                case 'revenue-desc':
                    return b.revenue - a.revenue;
                case 'revenue-asc':
                    return a.revenue - b.revenue;
                case 'name':
                    return a.product_name.localeCompare(b.product_name);
                default:
                    return b.quantity - a.quantity;
            }
        });
    }, [items, searchQuery, sortBy]);

    // Max quantity for bar scaling
    const maxQuantity = useMemo(() => {
        if (items.length === 0) return 1;
        return Math.max(...items.map((i) => i.quantity), 1);
    }, [items]);

    const getRankBadge = (index: number) => {
        if (sortBy !== 'quantity-desc') return `#${index + 1}`;
        if (index === 0) return '🥇 1';
        if (index === 1) return '🥈 2';
        if (index === 2) return '🥉 3';
        return `#${index + 1}`;
    };

    return (
        <div className="space-y-6">
            {/* Header / Filter Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 text-xl font-bold shadow-inner">
                            📦
                        </span>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
                                {title || 'Items Sold Breakdown'}
                            </h2>
                            <p className="text-xs sm:text-sm text-slate-400">
                                {subtitle || (
                                    <>
                                        Total units and revenue sold for{' '}
                                        <span className="font-semibold text-blue-400">{dateRangeLabel || currentTimeframe}</span>
                                    </>
                                )}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Timeframe Switcher if standalone */}
                {showTimeframeSelector && (
                    <div className="flex flex-wrap items-center gap-2 bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800 backdrop-blur-md">
                        {[
                            { key: 'daily', label: 'Daily', icon: '📊' },
                            { key: 'weekly', label: 'Weekly', icon: '📈' },
                            { key: 'monthly', label: 'Monthly', icon: '📅' },
                            { key: 'custom', label: 'Custom', icon: '🔍' },
                        ].map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setCurrentTimeframe(tab.key as any)}
                                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 active:scale-95 cursor-pointer ${
                                    currentTimeframe === tab.key
                                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                                }`}
                            >
                                <span>{tab.icon}</span>
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Sub-controls for Custom / Monthly selectors when in standalone mode */}
            {showTimeframeSelector && currentTimeframe === 'monthly' && (
                <div className="flex items-center justify-end">
                    <MonthSelector
                        selectedYear={year}
                        selectedMonth={month}
                        onChange={(yr, mo) => {
                            setYear(yr);
                            setMonth(mo);
                        }}
                    />
                </div>
            )}

            {showTimeframeSelector && currentTimeframe === 'custom' && (
                <div className="glass-card-sm rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Date Range:</span>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={(e) => setCustomStartDate(e.target.value)}
                                className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-medium focus:outline-none focus:border-blue-500"
                            />
                            <span className="text-slate-500 text-xs">to</span>
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={(e) => setCustomEndDate(e.target.value)}
                                className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-medium focus:outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Or Select Month:</span>
                        <MonthSelector
                            selectedYear={year}
                            selectedMonth={month}
                            onChange={(yr, mo) => {
                                setYear(yr);
                                setMonth(mo);
                            }}
                        />
                    </div>
                </div>
            )}

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Units Sold */}
                <div className="glass-card-sm rounded-2xl p-4 sm:p-5 relative overflow-hidden group hover:border-blue-500/40 transition-all duration-300">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Units Sold</span>
                        <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 text-lg">🛍️</span>
                    </div>
                    <p className="text-2xl sm:text-3xl font-extrabold text-white">
                        {loading ? '...' : summary.totalUnitsSold.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">Total items dispatched</p>
                </div>

                {/* Total Items Revenue */}
                <div className="glass-card-sm rounded-2xl p-4 sm:p-5 relative overflow-hidden group hover:border-emerald-500/40 transition-all duration-300">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Items Revenue</span>
                        <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 text-lg">💰</span>
                    </div>
                    <p className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono">
                        {loading ? '...' : `Rs.${summary.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">Cumulative sales value</p>
                </div>

                {/* Unique Products Sold */}
                <div className="glass-card-sm rounded-2xl p-4 sm:p-5 relative overflow-hidden group hover:border-indigo-500/40 transition-all duration-300">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Unique Products</span>
                        <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 text-lg">🏷️</span>
                    </div>
                    <p className="text-2xl sm:text-3xl font-extrabold text-indigo-300">
                        {loading ? '...' : summary.totalProducts}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">Distinct catalog items</p>
                </div>

                {/* Top Selling Product */}
                <div className="glass-card-sm rounded-2xl p-4 sm:p-5 relative overflow-hidden group hover:border-amber-500/40 transition-all duration-300">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Top Performer</span>
                        <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 text-lg">🏆</span>
                    </div>
                    <p className="text-base sm:text-lg font-bold text-amber-300 truncate" title={summary.topProduct?.product_name || 'None'}>
                        {loading ? '...' : summary.topProduct ? summary.topProduct.product_name : 'No Sales Yet'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1 font-medium">
                        {summary.topProduct ? `${summary.topProduct.quantity} units sold` : '—'}
                    </p>
                </div>
            </div>

            {/* Filter, Search & Sort Bar */}
            <div className="glass-card-sm rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </span>
                    <input
                        type="text"
                        placeholder="Search item by name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 bg-slate-900/60 border border-slate-700/80 rounded-xl text-white text-xs sm:text-sm focus:outline-none focus:border-blue-500 transition-all font-medium"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-white text-xs"
                        >
                            ✕
                        </button>
                    )}
                </div>

                {/* Sort Selector */}
                <div className="flex items-center gap-2 self-end sm:self-auto">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">Sort By:</span>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="bg-slate-900 border border-slate-700 text-slate-200 text-xs sm:text-sm rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                        <option value="quantity-desc">Quantity (High → Low)</option>
                        <option value="quantity-asc">Quantity (Low → High)</option>
                        <option value="revenue-desc">Revenue (High → Low)</option>
                        <option value="revenue-asc">Revenue (Low → High)</option>
                        <option value="name">Product Name (A → Z)</option>
                    </select>
                </div>
            </div>

            {/* Items Table & List */}
            <div className="glass-card rounded-2xl overflow-hidden">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-sm text-slate-400 font-medium">Aggregating items sold data...</p>
                    </div>
                ) : filteredAndSortedItems.length === 0 ? (
                    <div className="text-center py-16 text-slate-400">
                        <span className="text-5xl block mb-3">📦</span>
                        <p className="text-base font-semibold text-slate-300">No items sold during this timeframe.</p>
                        {searchQuery ? (
                            <p className="text-xs text-slate-500 mt-1">No items match &quot;{searchQuery}&quot;.</p>
                        ) : (
                            <p className="text-xs text-slate-500 mt-1">Items sold in transactions will appear here automatically.</p>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-950/60 text-slate-400 uppercase text-xs font-bold tracking-wider border-b border-slate-800">
                                    <th className="px-6 py-4 w-16 text-center">Rank</th>
                                    <th className="px-6 py-4">Item / Product Name</th>
                                    <th className="px-6 py-4 text-right">Units Sold</th>
                                    <th className="px-6 py-4 text-left w-48">Volume Share</th>
                                    <th className="px-6 py-4 text-right">Avg Unit Price</th>
                                    <th className="px-6 py-4 text-right">Total Revenue</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 text-slate-300">
                                {filteredAndSortedItems.map((item, index) => {
                                    const sharePct = item.percentage_of_units;
                                    const barWidth = Math.max((item.quantity / maxQuantity) * 100, 4);

                                    return (
                                        <tr
                                            key={item.product_name}
                                            className="hover:bg-slate-800/40 transition-colors duration-150 group"
                                        >
                                            {/* Rank */}
                                            <td className="px-6 py-4 text-center font-mono text-xs font-semibold text-slate-400">
                                                {getRankBadge(index)}
                                            </td>

                                            {/* Product Name */}
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-white text-base group-hover:text-blue-400 transition-colors">
                                                        {item.product_name}
                                                    </span>
                                                    <span className="text-[11px] text-slate-500">
                                                        Appeared in {item.orders_count} invoice{item.orders_count !== 1 ? 's' : ''}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Units Sold */}
                                            <td className="px-6 py-4 text-right">
                                                <span className="inline-flex items-center px-3 py-1 rounded-lg bg-blue-500/10 text-blue-400 font-extrabold font-mono text-base border border-blue-500/20">
                                                    {item.quantity.toLocaleString()}
                                                </span>
                                            </td>

                                            {/* Volume Share Bar */}
                                            <td className="px-6 py-4">
                                                <div className="w-full space-y-1">
                                                    <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                                                        <span>{sharePct}%</span>
                                                    </div>
                                                    <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                                                            style={{ width: `${barWidth}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Avg Unit Price */}
                                            <td className="px-6 py-4 text-right font-mono text-slate-300">
                                                Rs.{item.avg_price.toFixed(2)}
                                            </td>

                                            {/* Total Revenue */}
                                            <td className="px-6 py-4 text-right font-mono font-bold text-emerald-400 text-base">
                                                Rs.{item.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-950/80 font-bold border-t-2 border-slate-800 text-white">
                                    <td colSpan={2} className="px-6 py-4 text-xs uppercase tracking-wider text-slate-400">
                                        Total ({filteredAndSortedItems.length} Products)
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-blue-400 text-lg">
                                        {filteredAndSortedItems.reduce((sum, i) => sum + i.quantity, 0).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-xs text-slate-500">100% of timeframe</td>
                                    <td className="px-6 py-4"></td>
                                    <td className="px-6 py-4 text-right font-mono text-emerald-400 text-lg">
                                        Rs.{filteredAndSortedItems.reduce((sum, i) => sum + i.revenue, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
