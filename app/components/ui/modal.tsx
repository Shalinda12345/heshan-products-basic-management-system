'use client';

import React, { useEffect, useId, useRef } from 'react';

// Accessible dialog: Escape and the backdrop close it, focus moves into it and returns to where it was.
export default function Modal({ open, title, description, onClose, children, footer, size = 'md' }: {
    open: boolean;
    title: string;
    description?: React.ReactNode;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    size?: 'sm' | 'md' | 'lg';
}) {
    const titleId = useId();
    const panelRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement as HTMLElement | null;
        // Focus the first field, or the dialog itself
        const first = panelRef.current?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea, button[data-autofocus]');
        (first ?? panelRef.current)?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCloseRef.current();
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            previous?.focus?.();
        };
    }, [open]);

    if (!open) return null;

    const width = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl';
    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div
                ref={panelRef}
                tabIndex={-1}
                className={`relative w-full ${width} max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl shadow-black/60 focus:outline-none`}
            >
                <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-4">
                    <div>
                        <h2 id={titleId} className="text-lg font-bold text-white">{title}</h2>
                        {description && <p className="mt-1 text-xs text-slate-400">{description}</p>}
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="px-6 py-5">{children}</div>
                {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-slate-800 px-6 py-4">{footer}</div>}
            </div>
        </div>
    );
}
