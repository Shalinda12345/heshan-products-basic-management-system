'use client';

import ExpensesNavigation from "@/app/components/expenses/expenses-navigation/page";
import CustomAlert, { AlertVariant } from '@/app/components/ui/custom-alert/page';
import React, { useEffect, useState, FormEvent } from "react";

interface Expense {
    expense_item_id: number;
    expense_name: string;
    quantity: number;
    per_expense_amount: number;
    total: number;
    expense_date: string;
}

interface Expense_Item_List {
    expense_id: number;
    expense_name: string;
}

interface Employees {
    employee_id: number;
    employee_name: string;
    employee_address: string;
    employee_contact_no: string;
    maritial_status: string;
}

export default function ExpensesPage() {
    const [expenseName, setExpenseName] = useState("");
    const [allExpenseItems, setAllExpenseItems] = useState<Expense_Item_List[]>([]);
    const [loadingDropdown, setLoadingDropdown] = useState<boolean>(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [quantityPerProduct, setQuantityPerProduct] = useState(0);
    const [amount, setAmount] = useState(0);
    const [expenseDate, setExpenseDate] = useState("");
    const [employeeName, setEmployeeName] = useState("");
    const [allEmployees, setAllEmployees] = useState([]);

    // For right side recent list
    const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
    const [loadingRecent, setLoadingRecent] = useState<boolean>(true);
    const [alertState, setAlertState] = useState<{ isOpen: boolean; variant: AlertVariant; title: string; message: string }>({
        isOpen: false,
        variant: 'info',
        title: '',
        message: '',
    });

    const showAlert = (variant: AlertVariant, title: string, message: string) => {
        setAlertState({ isOpen: true, variant, title, message });
    };

    const closeAlert = () => {
        setAlertState(prev => ({ ...prev, isOpen: false }));
    };

    // Fetch dropdown items list
    useEffect(() => {
        async function fetchExpenseItemsList() {
            try {
                const response = await fetch("/api/expenses/get-expense-item-list");
                if (!response.ok) throw new Error("Network response was not ok");
                const data = await response.json();
                setAllExpenseItems(data);
            } catch (error) {
                console.error("Error fetching expense items list:", error);
            } finally {
                setLoadingDropdown(false);
            }
        }
        fetchExpenseItemsList();
    }, []);

    const fetchEmployeeList = async () => {
        try {
            const response = await fetch("/api/employees");
            if (!response.ok) throw new Error("Network response was not ok");
            const data = await response.json();
            setAllEmployees(data.data);
        } catch (error) {
            console.error("Error fetching employee list:", error);
        } finally {
            setLoadingDropdown(false);
        }
    };

    // Fetch today's expenses
    const fetchRecentExpenses = async () => {
        try {
            const response = await fetch("/api/expenses/get-daily-expenses", { cache: 'no-store' });
            if (!response.ok) throw new Error("Network response was not ok");
            const data = await response.json();
            setRecentExpenses(data);
        } catch (error) {
            console.error("Error fetching recent expenses:", error);
        } finally {
            setLoadingRecent(false);
        }
    };

    // Safely execute initial data loading inside a local async handler 
    // to satisfy strict custom react-hooks linters
    useEffect(() => {
        const initializeLedger = async () => {
            await fetchRecentExpenses();
        };
        initializeLedger();
    }, []);

    useEffect(() => {
        fetchEmployeeList();
    }, []);

    // Check if the current expense requires a quantity breakdown
    const requiresQuantity = ["Milk Packet(900ml)", "Sugar", "Watalappan Cup", "Drink Cup"].includes(expenseName);

    // Dynamic calculations
    const calculatedTotal = requiresQuantity ? quantityPerProduct * amount : amount;

    const addToExpenseList = async (e: FormEvent) => {
        e.preventDefault();
        if (!expenseDate || !expenseName || amount <= 0 || (requiresQuantity && quantityPerProduct <= 0)) {
            showAlert('warning', 'Missing Fields', 'Please fill in all required fields with positive values.');
            return;
        }

        setIsSubmitting(true);
        setLoadingRecent(true); // Explicitly set loading state before background refetch

        try {
            const response = await fetch("/api/expenses/save-expenses", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    expense_name: expenseName,
                    quantity: requiresQuantity ? quantityPerProduct : 1,
                    per_expense_amount: amount,
                    total: calculatedTotal,
                    expense_date: expenseDate
                }),
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Refresh today's list dynamically
                await fetchRecentExpenses();

                // Clear local states on success (keep the date for convenience in bulk entry)
                setExpenseName("");
                setQuantityPerProduct(0);
                setAmount(0);
            } else {
                showAlert('error', 'Save Failed', result.message || 'Failed to save data to the database.');
                setLoadingRecent(false);
            }
        } catch (error) {
            console.error("Network connection error saving expense:", error);
            showAlert('error', 'Network Error', 'A network connection error occurred. Please try again.');
            setLoadingRecent(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    const totalTodayExpenses = recentExpenses.reduce((sum, item) => sum + Number(item.total), 0);

    return (
        <main className="page-wrapper">
            <div className="page-glow" />
            <CustomAlert
                isOpen={alertState.isOpen}
                variant={alertState.variant}
                title={alertState.title}
                message={alertState.message}
                onClose={closeAlert}
            />
            <ExpensesNavigation />
            <div className="page-content max-w-7xl mx-auto space-y-8 py-10 px-4 sm:px-6 lg:px-8">
                {/* Header Section */}
                <div className="section-divider pb-6">
                    <h1 className="text-4xl font-bold text-slate-100">
                        💸 Expense Management
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
                        Record daily corporate expenditures and monitor outbound cash flow logs.
                    </p>
                </div>

                {/* Split Column Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                    {/* LEFT COLUMN: Record Form (5 Cols) */}
                    <div className="lg:col-span-5 glass-card rounded-2xl p-6 sm:p-8">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Record Expenditure</h2>
                        </div>

                        <form onSubmit={addToExpenseList} className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                                    Expenditure Date
                                </label>
                                <input
                                    type="date"
                                    value={expenseDate}
                                    onChange={(e) => setExpenseDate(e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-900/30 bg-slate-900 text-white text-sm font-medium transition-all"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                                    Expense Category / Item
                                </label>
                                {loadingDropdown ? (
                                    <p className="text-slate-400 py-3 text-sm animate-pulse">Loading categories...</p>
                                ) : (
                                    <select
                                        value={expenseName}
                                        onChange={(e) => {
                                            setExpenseName(e.target.value);
                                            setQuantityPerProduct(0);
                                            setAmount(0);
                                        }}
                                        className="w-full px-4 py-3 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-900/30 bg-slate-900 text-white text-sm font-medium transition-all"
                                        required
                                    >
                                        <option value="">Choose item type</option>
                                        {allExpenseItems.map((expense) => (
                                            <option key={expense.expense_id} value={expense.expense_name}>
                                                {expense.expense_name}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {requiresQuantity ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                                                Quantity
                                            </label>
                                            <input
                                                type="number"
                                                value={quantityPerProduct > 0 ? quantityPerProduct : ''}
                                                onChange={(e) => setQuantityPerProduct(Number(e.target.value))}
                                                className="w-full px-4 py-3 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-900/30 bg-slate-900 text-white text-sm font-medium transition-all"
                                                placeholder="0"
                                                min="1"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                                                Rate per Item
                                            </label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={amount > 0 ? amount : ''}
                                                onChange={(e) => setAmount(Number(e.target.value))}
                                                className="w-full px-4 py-3 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-900/30 bg-slate-900 text-white text-sm font-medium transition-all"
                                                placeholder="0.00"
                                                min="0.01"
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="p-3.5 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100/50 dark:border-blue-900/30 rounded-xl flex items-center justify-between text-sm">
                                        <span className="text-slate-500 dark:text-slate-400">Total Calculation:</span>
                                        <span className="font-bold text-blue-600 dark:text-blue-400">
                                            Rs. {calculatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                expenseName !== "" && expenseName !== "Salary" && (
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                                            Expense Amount (Rs.)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={amount > 0 ? amount : ''}
                                            onChange={(e) => setAmount(Number(e.target.value))}
                                            className="w-full px-4 py-3 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-900/30 bg-slate-900 text-white text-sm font-medium transition-all"
                                            placeholder="0.00"
                                            min="0.01"
                                            required
                                        />
                                    </div>
                                )
                            )}

                            {expenseName === "Salary" || expenseName === "Salary Advance" || expenseName === "Salary Loan" ? (
                                <div>
                                    <select
                                        value={employeeName}
                                        onChange={(e) => {
                                            setEmployeeName(e.target.value);
                                        }}
                                        className="w-full px-4 py-3 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-900/30 bg-slate-900 text-white text-sm font-medium transition-all"
                                        required
                                    >
                                        <option value="">Choose Employee</option>
                                        {allEmployees.map((employee: Employees) => (
                                            <option key={employee.employee_id} value={employee.employee_name}>
                                                {employee.employee_name}
                                            </option>
                                        ))}
                                    </select>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                                        Expense Amount (Rs.)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={amount > 0 ? amount : ''}
                                        onChange={(e) => setAmount(Number(e.target.value))}
                                        className="w-full px-4 py-3 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-900/30 bg-slate-900 text-white text-sm font-medium transition-all"
                                        placeholder="0.00"
                                        min="0.01"
                                        required
                                    />
                                </div>
                            ) : (<></>)}

                            <div className="pt-2">
                                {expenseName === "" ? (
                                    <p className="text-xs font-semibold text-center text-slate-400 dark:text-slate-500">
                                        Select an expense category to submit.
                                    </p>
                                ) : (
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-base rounded-xl shadow-lg hover:shadow-xl transform active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                </svg>
                                                <span>Submitting...</span>
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                                </svg>
                                                <span>Post Expenditure Entry</span>
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>

                    {/* RIGHT COLUMN: Recent Ledger (7 Cols) */}
                    <div className="lg:col-span-7 space-y-6">
                        {/* Summary Total Widget */}
                        <div className="glass-card-sm rounded-2xl p-6 flex items-center justify-between gap-4">
                            <div>
                                <h3 className="text-slate-800 dark:text-white font-bold text-lg">Today&apos;s Expenses</h3>
                                <p className="text-slate-400 text-xs mt-1">Live running ledger of expenditures recorded today.</p>
                            </div>
                            <div className="text-right">
                                <span className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider block mb-1">Total Expended</span>
                                <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">
                                    Rs.{totalTodayExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                        </div>

                        {/* Recent Table list */}
                        <div className="glass-card rounded-2xl overflow-hidden">
                            <div className="px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 4a2 2 0 00-2-2m-2 3h3M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
                                </svg>
                                <h4 className="text-sm font-bold text-slate-800 dark:text-white">Recent Ledger Stream</h4>
                            </div>

                            {loadingRecent ? (
                                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-xs text-slate-400 font-medium">Re-indexing ledger feeds...</p>
                                </div>
                            ) : recentExpenses.length === 0 ? (
                                <div className="text-center py-16 text-slate-400 dark:text-slate-500">
                                    <span className="text-4xl block mb-2">📭</span>
                                    <p className="text-sm font-semibold">No expenditures registered today.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs text-left border-collapse">
                                        <thead>
                                            <tr className="dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider border-b border-slate-100 dark:border-slate-850">
                                                <th className="px-5 py-3 font-mono text-[10px] w-24">Entry ID</th>
                                                <th className="px-5 py-3">Category/Description</th>
                                                <th className="px-5 py-3 text-right">Details</th>
                                                <th className="px-5 py-3 text-right w-28">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300 font-medium">
                                            {recentExpenses.map((expense) => (
                                                <tr key={expense.expense_item_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors">
                                                    <td className="px-5 py-3.5 font-mono text-slate-400 text-[10px]">#EXP-{expense.expense_item_id}</td>
                                                    <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-white">{expense.expense_name}</td>
                                                    <td className="px-5 py-3.5 text-right font-mono text-slate-400 text-[11px]">
                                                        {expense.quantity && expense.quantity > 1 ? (
                                                            <span>{expense.quantity} × Rs.{expense.per_expense_amount.toFixed(2)}</span>
                                                        ) : (
                                                            <span>-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-3.5 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
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
                </div>
            </div>
        </main>
    );
}