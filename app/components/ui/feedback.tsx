'use client';

import React from 'react';
import { formatChange } from '@/app/lib/format';

type Tone = 'success' | 'error' | 'warning' | 'info';

const NOTICE_TONES: Record<Tone, string> = {
    success: 'border-emerald-800/50 bg-emerald-950/40 text-emerald-200',
    error: 'border-rose-800/50 bg-rose-950/40 text-rose-200',
    warning: 'border-amber-800/50 bg-amber-950/40 text-amber-200',
    info: 'border-sky-800/50 bg-sky-950/40 text-sky-200',
};

const ICONS: Record<Tone, string> = { success: '✓', error: '!', warning: '!', info: 'i' };

// An inline message box (saved, failed, or something to know). role=status/alert so it is announced.
export function Notice({ tone, title, children, onDismiss }: { tone: Tone; title?: string; children?: React.ReactNode; onDismiss?: () => void }) {
    return (
        <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${NOTICE_TONES[tone]}`}>
            <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-current/20 text-xs font-black">
                <span className="text-current">{ICONS[tone]}</span>
            </span>
            <div className="flex-1 min-w-0">
                {title && <p className="font-semibold">{title}</p>}
                {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
            </div>
            {onDismiss && (
                <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100">✕</button>
            )}
        </div>
    );
}

const BADGE_TONES = {
    green: 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50',
    red: 'bg-rose-950/40 text-rose-300 border-rose-800/50',
    amber: 'bg-amber-950/40 text-amber-300 border-amber-800/50',
    blue: 'bg-sky-950/40 text-sky-300 border-sky-800/50',
    violet: 'bg-violet-950/40 text-violet-300 border-violet-800/50',
    gray: 'bg-slate-800/60 text-slate-300 border-slate-700',
} as const;

export function Badge({ tone = 'gray', children, title }: { tone?: keyof typeof BADGE_TONES; children: React.ReactNode; title?: string }) {
    return (
        <span title={title} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${BADGE_TONES[tone]}`}>
            {children}
        </span>
    );
}

export function ActiveBadge({ active }: { active: boolean }) {
    return active ? <Badge tone="green">● Active</Badge> : <Badge tone="gray">○ Inactive</Badge>;
}

export function DocumentStatusBadge({ status, reason }: { status: string; reason?: string | null }) {
    return status === 'void'
        ? <Badge tone="red" title={reason ?? undefined}>⊘ Void</Badge>
        : <Badge tone="green">✓ Posted</Badge>;
}

// "▲ +12.3%" coloured by whether the change is good news. `upIsGood` false for costs.
export function ChangeIndicator({ change, upIsGood = true, suffix, format = formatChange }: {
    change: number | null | undefined;
    upIsGood?: boolean;
    suffix?: string;
    // How to show the number (default "+12.3%"); e.g. percentage points for a margin
    format?: (change: number) => string;
}) {
    if (change === null || change === undefined || !Number.isFinite(change)) {
        return <span className="whitespace-nowrap text-xs font-semibold text-slate-500">No comparison{suffix ? ` ${suffix}` : ''}</span>;
    }
    const flat = Math.abs(change) < 0.05;
    const good = flat ? null : (change > 0) === upIsGood;
    const color = flat ? 'text-slate-400' : good ? 'text-emerald-400' : 'text-rose-400';
    const arrow = flat ? '■' : change > 0 ? '▲' : '▼';
    return (
        <span className={`whitespace-nowrap text-xs font-semibold ${color}`}>
            <span aria-hidden>{arrow}</span> {format(change)}{suffix ? <span className="font-medium text-slate-500"> {suffix}</span> : null}
        </span>
    );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
    return (
        <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-400" role="status">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-blue-500" aria-hidden />
            {label}
        </div>
    );
}
