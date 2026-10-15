'use client';

import React, { useId } from 'react';

export const inputClass =
    'w-full px-4 py-2.5 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-900/30 bg-slate-900 text-white text-sm font-medium transition-all disabled:opacity-50';
export const labelClass = 'block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2';
export const filterClass =
    'px-3 py-2 border border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 bg-slate-900 text-white text-xs font-semibold';

export type StatusChoice = 'all' | 'posted' | 'void';

// The posted / void filter of the invoice, expense and return registers
export function StatusFilter({ value, onChange }: { value: StatusChoice; onChange: (value: StatusChoice) => void }) {
    return (
        <select aria-label="Status" value={value} onChange={(e) => onChange(e.target.value as StatusChoice)} className={filterClass}>
            <option value="all">Posted &amp; void</option>
            <option value="posted">Posted only</option>
            <option value="void">Void only</option>
        </select>
    );
}

// A labelled form control. The label is linked to the control, so screen readers (and tests) find it by name.
export function Field({ label, hint, error, children }: {
    label: string;
    hint?: React.ReactNode;
    error?: string | null;
    children: (id: string) => React.ReactNode;
}) {
    const id = useId();
    return (
        <div>
            <label htmlFor={id} className={labelClass}>{label}</label>
            {children(id)}
            {error ? <p className="mt-1.5 text-xs font-medium text-rose-400">{error}</p> : hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
        </div>
    );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

const VARIANTS: Record<ButtonVariant, string> = {
    primary: 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/10',
    success: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/10',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white',
    secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700',
    ghost: 'text-slate-300 hover:text-white hover:bg-slate-800/70',
};

export function Button({ variant = 'primary', size = 'md', busy = false, className = '', children, disabled, ...props }:
    React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md'; busy?: boolean }) {
    const sizing = size === 'sm' ? 'px-3 py-1.5 text-xs rounded-lg' : 'px-5 py-2.5 text-sm rounded-xl';
    return (
        <button
            type="button"
            {...props}
            disabled={disabled || busy}
            className={`inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${sizing} ${VARIANTS[variant]} ${className}`}
        >
            {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />}
            {children}
        </button>
    );
}

// Switch for active/inactive style settings
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
    return (
        <label className={`inline-flex items-center gap-3 select-none ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
            <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
            <span className="relative h-6 w-11 rounded-full bg-slate-700 transition-colors peer-checked:bg-emerald-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
            <span className="text-sm font-medium text-slate-200">{label}</span>
        </label>
    );
}
