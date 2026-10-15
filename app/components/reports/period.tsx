'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { isIsoDate } from '@/app/lib/dates';
import { PERIOD_PRESETS, describeRange, presetRange, type DateRange, type PeriodPreset } from '@/app/lib/periods';
import { filterClass } from '@/app/components/ui/form';

function isPreset(value: string | null): value is PeriodPreset {
    return !!value && Object.prototype.hasOwnProperty.call(PERIOD_PRESETS, value);
}

// The report period lives in the URL (?preset=… or ?from=…&to=…): links can be shared and the period
// stays the same when moving between report tabs.
export function usePeriod(defaultPreset: PeriodPreset = 'this_month') {
    const searchParams = useSearchParams();
    const pathname = usePathname();

    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const custom = isIsoDate(from) && isIsoDate(to) && from <= to;
    const preset = custom ? null : isPreset(searchParams.get('preset')) ? (searchParams.get('preset') as PeriodPreset) : defaultPreset;
    const range: DateRange = custom ? { from: from!, to: to! } : presetRange(preset!);

    // Only the address changes (Next.js keeps useSearchParams in step), so there is no trip to the server
    const go = (query: string) => window.history.replaceState(null, '', `${pathname}?${query}`);

    return {
        range,
        preset,
        query: searchParams.toString(),
        setPreset: (next: PeriodPreset) => go(`preset=${next}`),
        setRange: (next: DateRange) => go(`from=${next.from}&to=${next.to}`),
    };
}

export function PeriodBar({ period, comparedWith }: { period: ReturnType<typeof usePeriod>; comparedWith?: string }) {
    const { range, preset, setPreset, setRange } = period;
    return (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Report period">
            <select
                aria-label="Period"
                value={preset ?? 'custom'}
                onChange={(e) => e.target.value !== 'custom' && setPreset(e.target.value as PeriodPreset)}
                className={filterClass}
            >
                {(Object.keys(PERIOD_PRESETS) as PeriodPreset[]).map((key) => <option key={key} value={key}>{PERIOD_PRESETS[key]}</option>)}
                <option value="custom">Custom dates</option>
            </select>
            <input type="date" aria-label="From date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ from: e.target.value, to: range.to })} className={filterClass} />
            <span className="text-xs text-slate-500">to</span>
            <input type="date" aria-label="To date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ from: range.from, to: e.target.value })} className={filterClass} />
            <span className="ml-1 text-xs text-slate-400">
                <strong className="text-slate-200">{describeRange(range)}</strong>
                {comparedWith && <> compared with <strong className="text-slate-200">{comparedWith}</strong></>}
            </span>
        </div>
    );
}
