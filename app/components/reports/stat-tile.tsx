import React from 'react';
import { ChangeIndicator } from '@/app/components/ui/feedback';
import { formatAmount } from '@/app/lib/format';

// One headline number with its change against the comparison period
export function StatTile({ label, value, change, upIsGood = true, format, previous, hint, emphasis }: {
    label: string;
    value: string;
    change?: number | null;
    upIsGood?: boolean;
    // How to show the change (default: percent)
    format?: (change: number) => string;
    // The comparison period's value, shown under the change
    previous?: string;
    hint?: React.ReactNode;
    emphasis?: 'good' | 'bad' | null;
}) {
    const color = emphasis === 'bad' ? 'text-rose-300' : emphasis === 'good' ? 'text-emerald-300' : 'text-white';
    return (
        <div className="glass-card-sm rounded-2xl p-5">
            <p className="text-xs font-semibold text-slate-400">{label}</p>
            <p className={`mt-1.5 text-2xl font-extrabold tracking-tight ${color}`}>{value}</p>
            {change !== undefined && (
                <div className="mt-1.5">
                    <ChangeIndicator change={change} upIsGood={upIsGood} format={format} />
                    {previous !== undefined && <span className="ml-1.5 text-xs text-slate-500">from {previous}</span>}
                </div>
            )}
            {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
        </div>
    );
}

// The "vs before" table cell: a dash when there was nothing in either period, "New" when there was nothing before
export function VersusCell({ current, previous, change }: { current: number; previous: number; change: number | null }) {
    if (current === 0 && previous === 0) return <span className="text-slate-600">—</span>;
    if (previous === 0) return <span className="whitespace-nowrap text-xs font-semibold text-emerald-400">New this period</span>;
    return (
        <>
            <ChangeIndicator change={change} />
            <span className="block text-[11px] text-slate-500">from {formatAmount(previous)}</span>
        </>
    );
}
