"use client";

import ExpensesNavigation from "@/app/components/expenses/expenses-navigation/page"
import { useEffect, useState } from "react";

interface Expense {
    expense_item_id: number;
    expense_name: number;
    total: number;
    expense_date: string;
}

export default function DailyExpenses(){
    const [dailyExpenes, setDailyExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        async function fetchDailyExpenses() {
            try{
                const response = await fetch("/api/expenses/get-daily-expenses");
                if(!response.ok) throw new Error("Network response was not ok");
                const data = await response.json();
                setDailyExpenses(data);
            } catch (error) {
                console.log("Error fetching daily expenses:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchDailyExpenses();
    }, [])

    const totalExpense = dailyExpenes.reduce((sum, s) => sum + Number(s.total), 0);

    return (
        <main className="min-h-screen bg-slate-50/50 dark:bg-slate-900 py-8 px-4 sm:px-6 lg:px-8">
              <div className="max-w-7xl mx-auto space-y-8">
                <ExpensesNavigation />
        
                {/* Header Block */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 dark:border-slate-800 pb-5 gap-4">
                  <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Daily Expenses</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Real-time ledger of Expense items cleared today.</p>
                  </div>
                  
                  {/* Executive Summary Widget */}
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex items-center gap-4 shadow-sm min-w-[240px]">
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-lg text-xl">📊</div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Today's Expenses</p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">Rs.{totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                </div>
        
                {/* Table/Data Area */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-xl shadow-sm overflow-hidden">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-3">
                      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Querying ledger databases...</p>
                    </div>
                  ) : dailyExpenes.length === 0 ? (
                    <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                      <p className="text-lg font-medium">No Expenses documented today.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 uppercase text-xs font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                            <th className="px-6 py-4">Transaction ID</th>
                            <th className="px-6 py-4">Expense Date</th>
                            <th className="px-6 py-4 text-right">Expense Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                          {dailyExpenes.map((expense) => (
                            <tr key={expense.expense_item_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition-colors">
                              <td className="px-6 py-4 font-mono text-xs text-slate-400">#SAL-{expense.expense_item_id}</td>
                              <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                                {new Date(expense.expense_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                              </td>
                              <td className="px-6 py-4 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
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