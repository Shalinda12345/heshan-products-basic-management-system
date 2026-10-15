'use client';

import ExpensesNavigation from "@/app/components/expenses/expenses-navigation";
import { useAlert } from '@/app/components/ui/custom-alert';
import { Notice } from "@/app/components/ui/feedback";
import { inputClass, labelClass } from "@/app/components/ui/form";
import { usePermissions } from "@/app/components/auth/user-provider";
import { apiGet, apiSend, errorMessage, isNetworkError } from "@/app/lib/api-client";
import { isoDateFromDb } from "@/app/lib/dates";
import type { ExpenseKind } from "@/app/lib/expense-kinds";
import { formatAmount, formatDate, formatMoney } from "@/app/lib/format";
import { RETURN_TYPES, returnTypeLabel, type ReturnType } from "@/app/lib/returns";
import { useResource } from "@/app/lib/use-resource";
import React, { useState, FormEvent } from "react";

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Expense {
    expense_item_id: number;
    expense_name: string;
    employee_name: string | null;
    quantity: number;
    per_expense_amount: number;
    total: number;
    expense_date: string;
}

interface ExpenseCategory {
    expense_id: number;
    expense_name: string;
    // How the category is entered (set on the Manage → Expense Categories page)
    kind: ExpenseKind;
}

interface Employee {
    employee_id: number;
    employee_name: string;
}

interface StockItem {
    product_id: number;
    product_name: string;
    description: string;
    quantity: number;
    is_active?: boolean;
}

interface Sale {
    sale_id: number;
    customer_name: string;
    sale_date: string;
    grand_total: number;
}

interface SaleItem {
    sale_detail_id: number;
    sale_id: number;
    product_name: string;
    quantity: number;
    selling_price: number;
    total: number;
}

// What each return type does, as shown under the return type picker
const RETURN_TYPE_EFFECTS: Record<ReturnType, string> = {
    stock_expense_return: "📦 Stock will be reduced and an expense entry will be recorded.",
    sale_reduction_return: "🛒 Sale amount will be reduced and returned goods added back to stock.",
    sale_reduction_expense_return: "⚠️ Sale amount will be reduced and goods written off as an expense. No stock credit.",
};

// Badge colour per return type
const RETURN_TYPE_BADGE: Record<ReturnType, string> = {
    stock_expense_return: "bg-rose-950/30 border-rose-800/40 text-rose-400",
    sale_reduction_return: "bg-teal-950/30 border-teal-800/40 text-teal-400",
    sale_reduction_expense_return: "bg-purple-950/30 border-purple-800/40 text-purple-400",
};

const RETURN_TYPE_ACCENT: Record<ReturnType, string> = {
    stock_expense_return: "border-rose-800/60 focus:border-rose-500 focus:ring-rose-900/30",
    sale_reduction_return: "border-teal-800/60 focus:border-teal-500 focus:ring-teal-900/30",
    sale_reduction_expense_return: "border-purple-800/60 focus:border-purple-500 focus:ring-purple-900/30",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
    const { can } = usePermissions();
    const { show: showAlert, alert } = useAlert();

    // ── General form state ────────────────────────────────────────────────────
    const [expenseName, setExpenseName] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [quantityPerProduct, setQuantityPerProduct] = useState(0);
    const [amount, setAmount] = useState(0);
    const [expenseDate, setExpenseDate] = useState("");
    const [employeeName, setEmployeeName] = useState("");

    // ── Stock expense return state ────────────────────────────────────────────
    const [selectedReturnProductId, setSelectedReturnProductId] = useState("");
    const [returnQuantity, setReturnQuantity] = useState(0);
    const [returnAmount, setReturnAmount] = useState(0);

    // ── Return type sub-selector ──────────────────────────────────────────────
    const [returnType, setReturnType] = useState<ReturnType | "">("");

    // ── Sale-reduction return state ───────────────────────────────────────────
    const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
    const [selectedSaleItems, setSelectedSaleItems] = useState<SaleItem[]>([]);
    const [loadingSaleItems, setLoadingSaleItems] = useState(false);
    const [selectedSaleItemName, setSelectedSaleItemName] = useState("");
    const [saleReturnQuantity, setSaleReturnQuantity] = useState(0);
    const [saleReturnPrice, setSaleReturnPrice] = useState(0);
    const [saleReturnExpensePrice, setSaleReturnExpensePrice] = useState(0);
    // For sale_reduction_return: user also picks a stock item to credit back
    const [creditStockProductId, setCreditStockProductId] = useState("");

    // ── Data ──────────────────────────────────────────────────────────────────
    const categories = useResource<ExpenseCategory[]>("/api/expenses/get-expense-item-list");
    const employees = useResource<{ data: Employee[] }>("/api/employees");
    const recent = useResource<Expense[]>("/api/expenses/get-daily-expenses");
    const allExpenseItems = categories.data ?? [];
    const allEmployees = employees.data?.data ?? [];
    const recentExpenses = recent.data ?? [];
    const loadError = categories.error ?? employees.error ?? recent.error;

    // ── Derived values ────────────────────────────────────────────────────────
    const selectedKind = allExpenseItems.find((item) => item.expense_name === expenseName)?.kind;
    const requiresQuantity = selectedKind === "quantity";
    const isSalaryType = selectedKind === "salary";
    const isReturn = selectedKind === "return";
    const isSaleReturn = returnType === "sale_reduction_return" || returnType === "sale_reduction_expense_return";
    // Returns change invoices and stock, so only roles that manage returns see that category
    const expenseOptions = allExpenseItems.filter((item) => item.kind !== "return" || can("returns.manage"));
    const calculatedTotal = requiresQuantity ? quantityPerProduct * amount : amount;

    // Only the return form needs the stock levels and the invoice list
    const stock = useResource<StockItem[]>(isReturn ? "/api/stock" : null);
    const salesList = useResource<Sale[]>(isSaleReturn ? "/api/sales/get-sales-list" : null);
    const allStockItems = (stock.data ?? []).filter((item) => item.is_active !== false);
    const allSales = salesList.data ?? [];
    const returnLoadError = isReturn ? stock.error ?? (isSaleReturn ? salesList.error : null) : null;

    const selectedReturnProduct = allStockItems.find((s) => s.product_id === Number(selectedReturnProductId));
    const returnTotal = returnQuantity * returnAmount;

    const selectedSale = allSales.find((s) => s.sale_id === selectedSaleId);
    const selectedSaleItem = selectedSaleItems.find((i) => i.product_name === selectedSaleItemName);
    const saleReturnTotal = saleReturnQuantity * saleReturnPrice;
    const saleReturnExpenseTotal = saleReturnQuantity * saleReturnExpensePrice;

    // ── Reset helpers ─────────────────────────────────────────────────────────
    // Clears what was entered for the chosen return type
    const clearReturnDetails = () => {
        setSelectedReturnProductId("");
        setReturnQuantity(0);
        setReturnAmount(0);
        setSelectedSaleId(null);
        setSelectedSaleItems([]);
        setSelectedSaleItemName("");
        setSaleReturnQuantity(0);
        setSaleReturnPrice(0);
        setSaleReturnExpensePrice(0);
        setCreditStockProductId("");
    };

    const resetReturnFields = () => {
        setReturnType("");
        clearReturnDetails();
    };

    // ─── Data fetching ────────────────────────────────────────────────────────

    const fetchSaleItems = async (saleId: number) => {
        setLoadingSaleItems(true);
        setSelectedSaleItems([]);
        setSelectedSaleItemName("");
        setSaleReturnQuantity(0);
        setSaleReturnPrice(0);
        try {
            setSelectedSaleItems(await apiGet<SaleItem[]>(`/api/sales/get-sale-items?sale_id=${saleId}`));
        } catch (error) {
            console.error("Error fetching sale items:", error);
        } finally {
            setLoadingSaleItems(false);
        }
    };

    // ─── Form submission ──────────────────────────────────────────────────────

    // Posts a return. Once it is saved: refreshes the ledger and the lists it changed, clears the form and confirms.
    const submitReturn = async (body: Record<string, unknown>, successMessage: string) => {
        setIsSubmitting(true);
        try {
            await apiSend("/api/expenses/save-return-expenses", "POST", body);
            recent.reload();
            stock.reload();
            salesList.reload();
            setExpenseName("");
            resetReturnFields();
            showAlert('success', 'Return Processed', successMessage);
        } catch (error) {
            showAlert('error', isNetworkError(error) ? 'Network Error' : 'Return Failed', errorMessage(error));
        } finally {
            setIsSubmitting(false);
        }
    };

    const addToExpenseList = async (e: FormEvent) => {
        e.preventDefault();

        // ── Return branch ─────────────────────────────────────────────────────
        if (isReturn) {
            if (!returnType) {
                showAlert('warning', 'Select Return Type', 'Please choose a Return Type to proceed.');
                return;
            }

            if (returnType === "stock_expense_return") {
                if (!expenseDate || !selectedReturnProductId || returnQuantity <= 0 || returnAmount <= 0) {
                    showAlert('warning', 'Missing Fields', 'Please fill in all required fields with positive values.');
                    return;
                }
                if (selectedReturnProduct && returnQuantity > selectedReturnProduct.quantity) {
                    showAlert('warning', 'Insufficient Stock', `Cannot return more than current stock (${selectedReturnProduct.quantity} units).`);
                    return;
                }
                await submitReturn({
                    return_type: returnType,
                    product_id: Number(selectedReturnProductId),
                    product_name: selectedReturnProduct?.product_name ?? "",
                    quantity: returnQuantity,
                    per_unit_amount: returnAmount,
                    expense_date: expenseDate,
                }, `Stock Expense Return for "${selectedReturnProduct?.product_name}" recorded.`);
                return;
            }

            // Sale-reduction returns: the server checks the line under a lock, so it has the final word on quantities
            const creditsStock = returnType === "sale_reduction_return";
            const missing = !expenseDate || !selectedSaleId || !selectedSaleItemName || saleReturnQuantity <= 0 || saleReturnPrice <= 0
                || (creditsStock ? !creditStockProductId : saleReturnExpensePrice <= 0);
            if (missing) {
                showAlert('warning', 'Missing Fields', creditsStock
                    ? 'Please complete all sale return fields including the stock item to credit.'
                    : 'Please complete all sale return fields.');
                return;
            }
            if (selectedSaleItem && saleReturnQuantity > Number(selectedSaleItem.quantity)) {
                showAlert('warning', 'Quantity Exceeded', `Cannot return more than sold quantity (${selectedSaleItem.quantity} units).`);
                return;
            }
            await submitReturn({
                return_type: returnType,
                sale_id: selectedSaleId,
                sale_product_name: selectedSaleItemName,
                sale_quantity: saleReturnQuantity,
                sale_per_unit_amount: saleReturnPrice,
                ...(creditsStock
                    ? { product_id: Number(creditStockProductId) }
                    : { expense_per_unit_amount: saleReturnExpensePrice }),
                expense_date: expenseDate,
            }, creditsStock ? `Sale #${selectedSaleId} reduced and stock credited.` : `Sale #${selectedSaleId} reduced and expense recorded.`);
            return;
        }

        // ── Normal expense branch ─────────────────────────────────────────────
        if (!expenseDate || !expenseName || amount <= 0 || (requiresQuantity && quantityPerProduct <= 0)) {
            showAlert('warning', 'Missing Fields', 'Please fill in all required fields with positive values.');
            return;
        }
        if (isSalaryType && !employeeName) {
            showAlert('warning', 'Missing Employee', `Please choose the employee for this ${expenseName} entry.`);
            return;
        }

        setIsSubmitting(true);
        try {
            // The server works out the total itself
            await apiSend("/api/expenses/save-expenses", "POST", {
                expense_name: expenseName,
                employee_name: isSalaryType ? employeeName : undefined,
                quantity: requiresQuantity ? quantityPerProduct : 1,
                per_expense_amount: amount,
                expense_date: expenseDate,
            });
            recent.reload();
            setExpenseName("");
            setEmployeeName("");
            setQuantityPerProduct(0);
            setAmount(0);
            // Confirm explicitly: entries dated other than today don't show up in Today's ledger
            showAlert(
                'success',
                'Expense Saved',
                `"${expenseName}"${isSalaryType ? ` for ${employeeName}` : ""} — ${formatMoney(calculatedTotal)} recorded on ${expenseDate}.`
            );
        } catch (error) {
            showAlert('error', isNetworkError(error) ? 'Network Error' : 'Save Failed', errorMessage(error));
        } finally {
            setIsSubmitting(false);
        }
    };

    const totalTodayExpenses = recentExpenses.reduce((sum, item) => sum + Number(item.total), 0);
    const currentAccent = returnType ? RETURN_TYPE_ACCENT[returnType] : "border-amber-800/60 focus:border-amber-500 focus:ring-amber-900/30";

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <main className="page-wrapper">
            <div className="page-glow" />
            {alert}
            <ExpensesNavigation />
            <div className="page-content max-w-7xl mx-auto space-y-8 py-10 px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="section-divider pb-6">
                    <h1 className="text-4xl font-bold text-slate-100">💸 Expense Management</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
                        Record daily corporate expenditures and monitor outbound cash flow logs.
                    </p>
                </div>

                {loadError && <Notice tone="error" title="Could Not Load Data">{loadError}</Notice>}

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
                            {/* Date */}
                            <div>
                                <label className={labelClass}>
                                    Expenditure Date
                                </label>
                                <input
                                    type="date"
                                    value={expenseDate}
                                    onChange={(e) => setExpenseDate(e.target.value)}
                                    className={inputClass}
                                    required
                                />
                            </div>

                            {/* Category Dropdown */}
                            <div>
                                <label className={labelClass}>
                                    Expense Category / Item
                                </label>
                                {categories.loading ? (
                                    <p className="text-slate-400 py-3 text-sm animate-pulse">Loading categories...</p>
                                ) : (
                                    <select
                                        value={expenseName}
                                        onChange={(e) => {
                                            setExpenseName(e.target.value);
                                            setEmployeeName("");
                                            setQuantityPerProduct(0);
                                            setAmount(0);
                                            resetReturnFields();
                                        }}
                                        className={inputClass}
                                        required
                                    >
                                        <option value="">Choose item type</option>
                                        {expenseOptions.map((expense) => (
                                            <option key={expense.expense_id} value={expense.expense_name}>
                                                {expense.expense_name}
                                            </option>
                                        ))}
                                    </select>
                                )}

                                {/* ════════════════════════════════════════════════
                                    RETURN sub-panel — shown only when "Return" selected
                                    ════════════════════════════════════════════════ */}
                                {isReturn && (
                                    <div className="mt-4 space-y-4">
                                        {returnLoadError && <Notice tone="error">{returnLoadError}</Notice>}

                                        {/* ── Return Type Selector ─────────────────── */}
                                        <div>
                                            <label className={labelClass}>
                                                Return Type
                                            </label>
                                            <select
                                                value={returnType}
                                                onChange={(e) => {
                                                    setReturnType(e.target.value as ReturnType | "");
                                                    clearReturnDetails();
                                                }}
                                                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 bg-slate-900 text-white text-sm font-medium transition-all ${currentAccent}`}
                                                required
                                            >
                                                <option value="">Choose return type</option>
                                                {(Object.keys(RETURN_TYPES) as ReturnType[]).map((type) => (
                                                    <option key={type} value={type}>{RETURN_TYPES[type].label}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* ── Return type badge / description ──────── */}
                                        {returnType && (
                                            <div className={`px-4 py-2.5 rounded-xl border text-xs font-semibold ${RETURN_TYPE_BADGE[returnType]}`}>
                                                {RETURN_TYPE_EFFECTS[returnType]}
                                            </div>
                                        )}

                                        {/* ══════════════════════════════════════════════════
                                            STOCK-BASED RETURN (stock_expense_return)
                                            ══════════════════════════════════════════════════ */}
                                        {returnType === "stock_expense_return" && (
                                            <div className="space-y-3">
                                                {/* Product picker */}
                                                <div>
                                                    <label className={labelClass}>
                                                        Choose a Product to Return
                                                    </label>
                                                    <select
                                                        value={selectedReturnProductId}
                                                        onChange={(e) => {
                                                            setSelectedReturnProductId(e.target.value);
                                                            setReturnQuantity(0);
                                                            setReturnAmount(0);
                                                        }}
                                                        className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 bg-slate-900 text-white text-sm font-medium transition-all ${currentAccent}`}
                                                        required
                                                    >
                                                        <option value="">Choose a product</option>
                                                        {allStockItems.map((item) => (
                                                            <option key={item.product_id} value={item.product_id}>
                                                                {item.product_name} (Stock: {item.quantity})
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {selectedReturnProduct && (
                                                        <p className="text-xs text-amber-400 mt-1.5 font-medium">
                                                            Current stock: <span className="font-bold">{selectedReturnProduct.quantity}</span> units
                                                        </p>
                                                    )}
                                                </div>

                                                {selectedReturnProductId !== "" && (
                                                    <div className="space-y-3">
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div>
                                                                <label className={labelClass}>Quantity</label>
                                                                <input
                                                                    type="number"
                                                                    value={returnQuantity > 0 ? returnQuantity : ''}
                                                                    onChange={(e) => setReturnQuantity(Number(e.target.value))}
                                                                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 bg-slate-900 text-white text-sm font-medium transition-all ${currentAccent}`}
                                                                    placeholder="0"
                                                                    min="1"
                                                                    max={selectedReturnProduct?.quantity ?? undefined}
                                                                    required
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className={labelClass}>Amount per Unit (Rs.)</label>
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    value={returnAmount > 0 ? returnAmount : ''}
                                                                    onChange={(e) => setReturnAmount(Number(e.target.value))}
                                                                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 bg-slate-900 text-white text-sm font-medium transition-all ${currentAccent}`}
                                                                    placeholder="0.00"
                                                                    min="0.01"
                                                                    required
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="p-3.5 rounded-xl border flex items-center justify-between text-sm bg-rose-950/20 border-rose-900/30">
                                                            <span className="text-slate-400">
                                                                Total Return Expense:
                                                            </span>
                                                            <span className="font-bold text-rose-400">
                                                                {formatMoney(returnTotal)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* ══════════════════════════════════════════════════
                                            SALE-REDUCTION RETURNS (sale_reduction / sale_reduction_expense)
                                            ══════════════════════════════════════════════════ */}
                                        {isSaleReturn && (
                                            <div className="space-y-4">

                                                {/* ── Sale Selection Table ─────────────── */}
                                                <div>
                                                    <label className={labelClass}>
                                                        Select Sale Transaction
                                                    </label>
                                                    {salesList.loading ? (
                                                        <div className="flex items-center gap-2 py-3 text-slate-400 text-xs animate-pulse">
                                                            <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                                                            Loading sales...
                                                        </div>
                                                    ) : allSales.length === 0 ? (
                                                        <p className="text-xs text-slate-500 py-2">No sales found.</p>
                                                    ) : (
                                                        <div className="rounded-xl border border-slate-700 overflow-hidden max-h-52 overflow-y-auto">
                                                            <table className="w-full text-xs text-left">
                                                                <thead className="bg-slate-800/80 sticky top-0 z-10">
                                                                    <tr className="text-slate-400 uppercase font-bold tracking-wider">
                                                                        <th className="px-3 py-2.5 font-mono text-[10px]">Sale ID</th>
                                                                        <th className="px-3 py-2.5">Customer</th>
                                                                        <th className="px-3 py-2.5">Date</th>
                                                                        <th className="px-3 py-2.5 text-right">Settled Amt</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-800">
                                                                    {allSales.map((sale) => (
                                                                        <tr
                                                                            key={sale.sale_id}
                                                                            onClick={() => {
                                                                                setSelectedSaleId(sale.sale_id);
                                                                                fetchSaleItems(sale.sale_id);
                                                                                setSelectedSaleItemName("");
                                                                                setSaleReturnQuantity(0);
                                                                                setSaleReturnPrice(0);
                                                                            }}
                                                                            className={`cursor-pointer transition-colors ${selectedSaleId === sale.sale_id
                                                                                ? "bg-teal-900/30 border-l-2 border-teal-400"
                                                                                : "hover:bg-slate-800/40"
                                                                                }`}
                                                                        >
                                                                            <td className="px-3 py-2.5 font-mono text-slate-400 text-[10px]">
                                                                                #{sale.sale_id}
                                                                            </td>
                                                                            <td className="px-3 py-2.5 font-semibold text-white">{sale.customer_name}</td>
                                                                            <td className="px-3 py-2.5 text-slate-400">
                                                                                {formatDate(isoDateFromDb(sale.sale_date))}
                                                                            </td>
                                                                            <td className="px-3 py-2.5 text-right font-mono font-bold text-teal-400">
                                                                                Rs.{formatAmount(sale.grand_total)}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* ── Sale Items picker ─────────────────── */}
                                                {selectedSaleId && (
                                                    <div className="space-y-3">
                                                        {selectedSale && (
                                                            <div className="px-3 py-2 bg-teal-950/20 border border-teal-900/30 rounded-lg text-xs text-teal-300 font-medium">
                                                                Selected: Sale #{selectedSale.sale_id} — {selectedSale.customer_name}
                                                            </div>
                                                        )}

                                                        <div>
                                                            <label className={labelClass}>
                                                                Select Item to Return
                                                            </label>
                                                            {loadingSaleItems ? (
                                                                <div className="flex items-center gap-2 py-2 text-slate-400 text-xs animate-pulse">
                                                                    <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                                                                    Loading items...
                                                                </div>
                                                            ) : (
                                                                <select
                                                                    value={selectedSaleItemName}
                                                                    onChange={(e) => {
                                                                        const itemName = e.target.value;
                                                                        setSelectedSaleItemName(itemName);
                                                                        // Auto-fill selling price from sale item
                                                                        const sItem = selectedSaleItems.find(i => i.product_name === itemName);
                                                                        setSaleReturnPrice(sItem ? Number(sItem.selling_price) : 0);
                                                                        setSaleReturnQuantity(0);
                                                                        // Returned goods normally go back to the same product's stock
                                                                        const sameProduct = allStockItems.find(p => p.product_name === itemName);
                                                                        setCreditStockProductId(sameProduct ? String(sameProduct.product_id) : "");
                                                                    }}
                                                                    className="w-full px-4 py-3 border border-teal-800/60 rounded-xl focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-900/30 bg-slate-900 text-white text-sm font-medium transition-all"
                                                                    required
                                                                >
                                                                    <option value="">Choose item</option>
                                                                    {/* Lines already returned in full have nothing left to return */}
                                                                    {selectedSaleItems.filter((item) => Number(item.quantity) > 0).map((item) => (
                                                                        <option key={item.sale_detail_id} value={item.product_name}>
                                                                            {item.product_name} (Qty: {item.quantity}, @ Rs.{Number(item.selling_price).toFixed(2)})
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            )}
                                                            {selectedSaleItem && (
                                                                <p className="text-xs text-slate-400 mt-1.5">
                                                                    Available quantity in this sale: <span className="font-bold text-white">{selectedSaleItem.quantity}</span>
                                                                </p>
                                                            )}
                                                        </div>

                                                        {selectedSaleItemName && (
                                                            <div className="space-y-4">
                                                                <div className="grid grid-cols-2 gap-4">
                                                                    <div>
                                                                        <label className={labelClass}>Return Quantity</label>
                                                                        <input
                                                                            type="number"
                                                                            value={saleReturnQuantity > 0 ? saleReturnQuantity : ''}
                                                                            onChange={(e) => setSaleReturnQuantity(Number(e.target.value))}
                                                                            className="w-full px-4 py-3 border border-teal-800/60 rounded-xl focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-900/30 bg-slate-900 text-white text-sm font-medium transition-all"
                                                                            placeholder="0"
                                                                            min="1"
                                                                            max={selectedSaleItem?.quantity ?? undefined}
                                                                            required
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className={labelClass}>Selling Price (Rs.)</label>
                                                                        <input
                                                                            type="number"
                                                                            step="0.01"
                                                                            value={saleReturnPrice > 0 ? saleReturnPrice : ''}
                                                                            onChange={(e) => setSaleReturnPrice(Number(e.target.value))}
                                                                            className="w-full px-4 py-3 border border-teal-800/60 rounded-xl focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-900/30 bg-slate-900 text-white text-sm font-medium transition-all"
                                                                            placeholder="0.00"
                                                                            min="0.01"
                                                                            required
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {returnType === "sale_reduction_expense_return" && (
                                                                    <div>
                                                                        <label className={labelClass}>Expense Rate per Unit (Rs.)</label>
                                                                        <input
                                                                            type="number"
                                                                            step="0.01"
                                                                            value={saleReturnExpensePrice > 0 ? saleReturnExpensePrice : ''}
                                                                            onChange={(e) => setSaleReturnExpensePrice(Number(e.target.value))}
                                                                            className="w-full px-4 py-3 border border-teal-800/60 rounded-xl focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-900/30 bg-slate-900 text-white text-sm font-medium transition-all"
                                                                            placeholder="0.00"
                                                                            min="0.01"
                                                                            required
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Stock-to-credit picker — only for sale_reduction_return */}
                                                        {returnType === "sale_reduction_return" && selectedSaleItemName && (
                                                            <div>
                                                                <label className={labelClass}>
                                                                    Credit Stock Item (returned goods go to)
                                                                </label>
                                                                <select
                                                                    value={creditStockProductId}
                                                                    onChange={(e) => setCreditStockProductId(e.target.value)}
                                                                    className="w-full px-4 py-3 border border-teal-800/60 rounded-xl focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-900/30 bg-slate-900 text-white text-sm font-medium transition-all"
                                                                    required
                                                                >
                                                                    <option value="">Select stock to credit</option>
                                                                    {allStockItems.map((item) => (
                                                                        <option key={item.product_id} value={item.product_id}>
                                                                            {item.product_name} (Current stock: {item.quantity})
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        )}

                                                        {/* Total preview */}
                                                        {saleReturnQuantity > 0 && (
                                                            <div className="space-y-2">
                                                                {saleReturnPrice > 0 && (
                                                                    <div className={`p-3.5 rounded-xl border flex items-center justify-between text-sm ${returnType === "sale_reduction_return"
                                                                        ? "bg-teal-950/20 border-teal-900/30"
                                                                        : "bg-purple-950/20 border-purple-900/30"
                                                                        }`}>
                                                                        <span className="text-slate-400">
                                                                            Sale Reduction Amount:
                                                                        </span>
                                                                        <span className={`font-bold ${returnType === "sale_reduction_return" ? "text-teal-400" : "text-purple-400"}`}>
                                                                            {formatMoney(saleReturnTotal)}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                {returnType === "sale_reduction_expense_return" && saleReturnExpensePrice > 0 && (
                                                                    <div className="p-3.5 rounded-xl border border-rose-900/30 bg-rose-950/20 flex items-center justify-between text-sm">
                                                                        <span className="text-slate-400">
                                                                            Recorded Expense Amount:
                                                                        </span>
                                                                        <span className="font-bold text-rose-400">
                                                                            {formatMoney(saleReturnExpenseTotal)}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Normal Expense: Quantity + Amount (for quantity-based items) */}
                            {requiresQuantity ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className={labelClass}>Quantity</label>
                                            <input
                                                type="number"
                                                value={quantityPerProduct > 0 ? quantityPerProduct : ''}
                                                onChange={(e) => setQuantityPerProduct(Number(e.target.value))}
                                                className={inputClass}
                                                placeholder="0"
                                                min="1"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Rate per Item</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={amount > 0 ? amount : ''}
                                                onChange={(e) => setAmount(Number(e.target.value))}
                                                className={inputClass}
                                                placeholder="0.00"
                                                min="0.01"
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="p-3.5 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100/50 dark:border-blue-900/30 rounded-xl flex items-center justify-between text-sm">
                                        <span className="text-slate-500 dark:text-slate-400">Total Calculation:</span>
                                        <span className="font-bold text-blue-600 dark:text-blue-400">
                                            {formatMoney(calculatedTotal)}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                expenseName !== "" && !isSalaryType && !isReturn && (
                                    <div>
                                        <label className={labelClass}>
                                            Expense Amount (Rs.)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={amount > 0 ? amount : ''}
                                            onChange={(e) => setAmount(Number(e.target.value))}
                                            className={inputClass}
                                            placeholder="0.00"
                                            min="0.01"
                                            required
                                        />
                                    </div>
                                )
                            )}

                            {/* Salary picker */}
                            {isSalaryType && (
                                <div>
                                    <select
                                        value={employeeName}
                                        onChange={(e) => setEmployeeName(e.target.value)}
                                        className={inputClass}
                                        required
                                    >
                                        <option value="">Choose Employee</option>
                                        {allEmployees.map((employee) => (
                                            <option key={employee.employee_id} value={employee.employee_name}>
                                                {employee.employee_name}
                                            </option>
                                        ))}
                                    </select>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 mt-3">
                                        Expense Amount (Rs.)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={amount > 0 ? amount : ''}
                                        onChange={(e) => setAmount(Number(e.target.value))}
                                        className={inputClass}
                                        placeholder="0.00"
                                        min="0.01"
                                        required
                                    />
                                </div>
                            )}

                            {/* Submit button */}
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
                                                <span>
                                                    {isReturn
                                                        ? returnType ? `Submit ${returnTypeLabel(returnType)}` : "Submit Return"
                                                        : "Post Expenditure Entry"}
                                                </span>
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
                                    Rs.{formatAmount(totalTodayExpenses)}
                                </p>
                            </div>
                        </div>

                        {/* Recent Table */}
                        <div className="glass-card rounded-2xl overflow-hidden">
                            <div className="px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 4a2 2 0 00-2-2m-2 3h3M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
                                </svg>
                                <h4 className="text-sm font-bold text-slate-800 dark:text-white">Recent Ledger Stream</h4>
                            </div>

                            {recent.loading ? (
                                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-xs text-slate-400 font-medium">Loading today&apos;s expenses...</p>
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
                                                    <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-white">
                                                        {expense.expense_name}
                                                        {expense.employee_name && (
                                                            <span className="block text-[11px] font-medium text-slate-400">{expense.employee_name}</span>
                                                        )}
                                                    </td>
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