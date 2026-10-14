import React from 'react';

// Page frame shared by the management and report pages: background glow, optional section tabs, centred content.
export function PageShell({ nav, children, wide = false }: { nav?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
    return (
        <main className="page-wrapper">
            <div className="page-glow" />
            {nav}
            <div className={`page-content ${wide ? 'max-w-[96rem]' : 'max-w-7xl'} mx-auto space-y-8 py-10 px-4 sm:px-6 lg:px-8`}>
                {children}
            </div>
        </main>
    );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
    return (
        <div className="section-divider pb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
                <h1 className="text-3xl font-extrabold text-white tracking-tight">{title}</h1>
                {description && <p className="text-sm text-slate-400 mt-2 max-w-3xl">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
    );
}

export function Card({ title, description, actions, children, className = '' }: {
    title?: string;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <section className={`glass-card rounded-2xl p-6 ${className}`} aria-label={title}>
            {(title || actions) && (
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
                    <div>
                        {title && <h2 className="text-lg font-bold text-white">{title}</h2>}
                        {description && <p className="text-xs text-slate-400 mt-1">{description}</p>}
                    </div>
                    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
                </div>
            )}
            {children}
        </section>
    );
}

// Table chrome used everywhere: a scroll container plus header/row classes
export const tableClasses = {
    wrapper: 'overflow-x-auto rounded-xl glass-card-sm',
    table: 'w-full text-sm text-left border-collapse',
    head: 'bg-slate-950/40 text-slate-400 uppercase text-xs font-bold tracking-wider border-b border-slate-800',
    th: 'py-3.5 px-4 whitespace-nowrap',
    body: 'divide-y divide-slate-800 text-slate-300',
    row: 'hover:bg-slate-800/40 transition-colors',
    td: 'py-3 px-4',
    num: 'py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap',
};

export function TableMessage({ colSpan, title, hint }: { colSpan: number; title: string; hint?: string }) {
    return (
        <tr>
            <td colSpan={colSpan} className="py-12 px-5 text-center">
                <p className="text-slate-200 font-bold text-sm">{title}</p>
                {hint && <p className="text-slate-400 text-xs mt-1">{hint}</p>}
            </td>
        </tr>
    );
}

export function LoadingRows({ colSpan, rows = 4 }: { colSpan: number; rows?: number }) {
    return (
        <>
            {Array.from({ length: rows }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                    <td colSpan={colSpan} className="py-4 px-4"><div className="h-4 bg-slate-800 rounded w-full" /></td>
                </tr>
            ))}
        </>
    );
}
