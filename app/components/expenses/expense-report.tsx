'use client';

import React, { useState } from 'react';
import ExpensesNavigation from '@/app/components/expenses/expenses-navigation';
import { Notice } from '@/app/components/ui/feedback';
import { isoDateFromDb } from '@/app/lib/dates';
import { formatAmount, formatDate } from '@/app/lib/format';
import { useResource } from '@/app/lib/use-resource';

interface Expense {
    expense_item_id: number;
    expense_name: string;
    employee_name: string | null;
    quantity: number;
    per_expense_amount: number;
    total: number;
    expense_date: string;
}

export interface ExpenseReportProps {
    title: string;
    // Shown before the period, e.g. "Cumulative expenditure metrics for"
    description: string;
    period: string;
    totalLabel: string;
    icon: string;
    // Expense numbers are shown as #<idPrefix>-<id>, and can be searched that way
    idPrefix: string;
    // The API listing the period's expenses
    url: string;
    emptyText: string;
    // Extra header controls, such as a month picker
    controls?: React.ReactNode;
}

// The weekly, monthly and custom expense statements: the period's posted expenses and their total
export default function ExpenseReport({ title, description, period, totalLabel, icon, idPrefix, url, emptyText, controls }: ExpenseReportProps) {
    const { data: expenses, error, loading } = useResource<Expense[]>(url);
    const [searchQuery, setSearchQuery] = useState('');

    const query = searchQuery.toLowerCase();
    const filteredExpenses = (expenses ?? []).filter((expense) =>
        expense.expense_name.toLowerCase().includes(query) ||
        (expense.employee_name ?? '').toLowerCase().includes(query) ||
        `#${idPrefix.toLowerCase()}-${expense.expense_item_id}`.includes(query)
    );
    const totalExpense = filteredExpenses.reduce((sum, s) => sum + Number(s.total), 0);

    return (
        <main className="page-wrapper">
            <div className="page-glow" />
            <ExpensesNavigation />
            <div className="page-content max-w-7xl mx-auto space-y-8 py-10 px-4 sm:px-6 lg:px-8">

                {/* Header Block */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between section-divider pb-6 gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{title}</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                            {description} <span className="font-semibold text-rose-400">{period}</span>.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                        {controls}
                        <div className="glass-card-sm rounded-2xl p-5 flex items-center gap-4 min-w-[240px]">
                            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 text-2xl">
                                {icon}
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{totalLabel}</p>
                                <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">Rs.{formatAmount(totalExpense)}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="glass-card-sm rounded-xl p-4 flex items-center">
                    <div className="relative w-full max-w-md">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </span>
                        <input
                            type="text"
                            placeholder="Search by expense category..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-slate-700 rounded-xl bg-slate-900/50 text-white text-sm focus:outline-none focus:border-rose-500 transition-all font-medium"
                        />
                    </div>
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="ml-3 text-slate-400 hover:text-slate-200 text-xs font-semibold">
                            Clear
                        </button>
                    )}
                </div>

                {/* Expenses */}
                <div className="glass-card rounded-2xl overflow-hidden">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-24 space-y-4">
                            <div className="w-10 h-10 border-4 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Loading expenses...</p>
                        </div>
                    ) : error ? (
                        <div className="p-6">
                            <Notice tone="error" title="The expenses could not be loaded">{error}</Notice>
                        </div>
                    ) : filteredExpenses.length === 0 ? (
                        <div className="text-center py-20 text-slate-400 dark:text-slate-500">
                            <span className="text-5xl block mb-4">📭</span>
                            <p className="text-base font-semibold">{emptyText}</p>
                            {searchQuery && <p className="text-xs text-slate-500 mt-1">Try modifying your search criteria.</p>}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-950/40 text-slate-400 uppercase text-xs font-bold tracking-wider border-b border-slate-800">
                                        <th className="px-6 py-4">Transaction ID</th>
                                        <th className="px-6 py-4">Expense Category</th>
                                        <th className="px-6 py-4 text-right">Details</th>
                                        <th className="px-6 py-4">Posting Date</th>
                                        <th className="px-6 py-4 text-right">Outflow Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800 text-slate-300">
                                    {filteredExpenses.map((expense) => (
                                        <tr key={expense.expense_item_id} className="hover:bg-slate-800/40 transition-colors">
                                            <td className="px-6 py-4 font-mono text-xs text-slate-400 font-semibold">#{idPrefix}-{expense.expense_item_id}</td>
                                            <td className="px-6 py-4 font-bold text-white">
                                                {expense.expense_name}
                                                {expense.employee_name && (
                                                    <span className="block text-xs font-medium text-slate-400">{expense.employee_name}</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono text-slate-400 text-xs">
                                                {expense.quantity > 1 && `${expense.quantity} × `}Rs.{formatAmount(expense.per_expense_amount)}
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{formatDate(isoDateFromDb(expense.expense_date))}</td>
                                            <td className="px-6 py-4 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                                                Rs.{formatAmount(expense.total)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
