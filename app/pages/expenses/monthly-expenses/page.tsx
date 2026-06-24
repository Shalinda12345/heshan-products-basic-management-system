"use client";

import ExpensesNavigation from "@/app/components/expenses/expenses-navigation/page"
import { useEffect, useState } from "react";

interface Expense {
    expense_item_id: number;
    expense_name: string;
    quantity: number;
    per_expense_amount: number;
    total: number;
    expense_date: string;
}

export default function MonthlyExpenses() {
    const [monthlyExpenses, setMonthlyExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        async function fetchMonthlyExpenses() {
            try {
                const response = await fetch("/api/expenses/get-monthly-expenses", { cache: 'no-store'});
                if (!response.ok) throw new Error("Network response was not ok");
                const data = await response.json();
                setMonthlyExpenses(data);
            } catch (error) {
                console.error("Error fetching monthly expenses:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchMonthlyExpenses();
    }, []);

    const filteredExpenses = monthlyExpenses.filter(expense => 
        expense.expense_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        `#m-exp-${expense.expense_item_id}`.includes(searchQuery.toLowerCase())
    );

    const totalExpense = filteredExpenses.reduce((sum, s) => sum + Number(s.total), 0);

    return (
        <main className="min-h-screen bg-slate-50/50 dark:bg-slate-900">
            <ExpensesNavigation />
            <div className="max-w-7xl mx-auto space-y-8 py-10 px-4 sm:px-6 lg:px-8">
        
                {/* Header Block */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 dark:border-slate-800 pb-6 gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Monthly Fiscal Audits</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">High-level visibility into cumulative expenditure metrics for the current calendar period.</p>
                    </div>
                  
                    {/* Executive Summary Widget */}
                    <div className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl p-5 flex items-center gap-4 shadow-sm min-w-[280px]">
                        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 text-2xl">
                            💼
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Monthly Total</p>
                            <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                                Rs.{totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Search Bar / Filter Panel */}
                <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 shadow-sm">
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
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:border-rose-500 transition-all font-medium"
                        />
                    </div>
                    {searchQuery && (
                        <button 
                            onClick={() => setSearchQuery("")} 
                            className="ml-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-semibold"
                        >
                            Clear
                        </button>
                    )}
                </div>
        
                {/* Table/Data Area */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-2xl shadow-xl shadow-slate-200/20 dark:shadow-none overflow-hidden">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-24 space-y-4">
                            <div className="w-10 h-10 border-4 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Compiling monthly expenditure balances...</p>
                        </div>
                    ) : filteredExpenses.length === 0 ? (
                        <div className="text-center py-20 text-slate-400 dark:text-slate-500">
                            <span className="text-5xl block mb-4">📭</span>
                            <p className="text-base font-semibold">No expenses registered for this fiscal month.</p>
                            {searchQuery && <p className="text-xs text-slate-500 mt-1">Try modifying your search criteria.</p>}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 uppercase text-xs font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                                        <th className="px-6 py-4">Transaction ID</th>
                                        <th className="px-6 py-4">Expense Category</th>
                                        <th className="px-6 py-4 text-right">Details</th>
                                        <th className="px-6 py-4">Posting Date</th>
                                        <th className="px-6 py-4 text-right">Outflow Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                                    {filteredExpenses.map((expense) => (
                                        <tr key={expense.expense_item_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                            <td className="px-6 py-4 font-mono text-xs text-slate-400 font-semibold">#M-EXP-{expense.expense_item_id}</td>
                                            <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">{expense.expense_name}</td>
                                            <td className="px-6 py-4 text-right font-mono text-slate-400 text-xs">
                                                {expense.quantity && expense.quantity > 1 ? (
                                                    <span>{expense.quantity} × Rs.{expense.per_expense_amount.toFixed(2)}</span>
                                                ) : (
                                                    <span>Rs.{expense.per_expense_amount.toFixed(2)}</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                                                {new Date(expense.expense_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                                                Rs.{Number(expense.total).toFixed(2)}
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