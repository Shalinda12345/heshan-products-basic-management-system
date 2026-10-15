'use client';

import { Button } from './form';

// Wraps a filter's setter so that changing the filter also goes back to the first page
export function withPageReset(setPage: (page: number) => void) {
    return <T,>(setter: (value: T) => void) => (value: T) => {
        setter(value);
        setPage(1);
    };
}

export default function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (total === 0) return null;
    const first = (page - 1) * pageSize + 1;
    const last = Math.min(total, page * pageSize);
    return (
        <nav className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 text-xs text-slate-400" aria-label="Pages">
            <span>Showing <strong className="text-slate-200">{first.toLocaleString()}–{last.toLocaleString()}</strong> of <strong className="text-slate-200">{total.toLocaleString()}</strong></span>
            <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Previous</Button>
                <span>Page {page} of {pages}</span>
                <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next ›</Button>
            </div>
        </nav>
    );
}
