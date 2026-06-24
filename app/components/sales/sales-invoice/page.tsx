"use client";

import React, { useState, useEffect } from "react";

interface SaleItem {
  product_name: string;
  quantity: number;
  selling_price: number;
  total: number;
  actions?: React.ReactNode;
}

interface SalesInvoicePageProps {
  items: SaleItem[];
  onRemoveItem: (index: number) => void;
  customerName: string;
  saleDate: string;
  onCustomerChange: (customerName: string) => void;
  onSaleDateChange: (saleDate: string) => void;
}

interface Customer {
  customer_id: number;
  customer_name: string;
}

export default function SalesInvoicePage(props: SalesInvoicePageProps) {
  // Safe destructuring with fallbacks to avoid crashes before hooks execute
  const {
    items = [],
    onRemoveItem,
    customerName,
    saleDate,
    onCustomerChange,
    onSaleDateChange,
  } = props || {};

  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  const grandTotal = items.reduce((sum, item) => sum + item.total, 0);

  useEffect(() => {
    async function fetchCustomers() {
      try {
        const response = await fetch("/api/customers");
        if (!response.ok) throw new Error("Network response was not ok");
        const data = await response.json();
        setAllCustomers(data);
      } catch (error) {
        console.error("Error fetching customers:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchCustomers();
  }, []);

  // Next.js page route prerender guard (Moved AFTER all hooks):
  if (!props || !props.items) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Invoice Form Card Details */}
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-5 flex items-center gap-2">
          <svg className="w-5.5 h-5.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>Invoice Details</span>
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Date Input */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              Invoice Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={saleDate}
                onChange={(e) => onSaleDateChange && onSaleDateChange(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 dark:bg-slate-900 dark:text-white bg-white text-sm font-medium transition-all"
                required
              />
            </div>
          </div>

          {/* Customer Select */}
          <div>
            <label htmlFor="customer" className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              Select Customer
            </label>
            {loading ? (
              <div className="flex items-center justify-center py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-xl text-slate-400 text-sm animate-pulse">
                Loading client directories...
              </div>
            ) : (
              <select
                id="customer"
                value={customerName}
                onChange={(e) => onCustomerChange && onCustomerChange(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 dark:bg-slate-900 dark:text-white bg-white text-sm font-medium transition-all"
                required
              >
                <option value="">Choose a customer</option>
                {allCustomers.map((customer) => (
                  <option key={customer.customer_id} value={customer.customer_name}>
                    {customer.customer_name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Invoice Line Items */}
      <div>
        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          <span>Line Items</span>
        </h3>

        <div className="overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm bg-white dark:bg-slate-900">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 uppercase text-xs font-bold tracking-wider border-b border-slate-200 dark:border-slate-700/60">
                <th className="py-4 px-5 text-center w-12">#</th>
                <th className="py-4 px-5">Description</th>
                <th className="py-4 px-5 text-right w-24">Qty</th>
                <th className="py-4 px-5 text-right w-36">Unit Price</th>
                <th className="py-4 px-5 text-right w-40">Amount</th>
                <th className="py-4 px-5 text-center w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 px-5 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-4">
                      <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-full border border-slate-100 dark:border-slate-700">
                        <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-slate-800 dark:text-slate-200 font-bold text-base">Invoice is empty</h4>
                        <p className="text-slate-400 text-xs mt-1">
                          Begin compiling this statement by selecting &quot;Add Invoice Item&quot; at the top.
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr 
                    key={`${item.product_name}-${index}`}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors duration-150 text-slate-700 dark:text-slate-300"
                  >
                    <td className="py-4 px-5 text-center text-slate-400 font-mono text-xs">{index + 1}</td>
                    <td className="py-4 px-5 font-semibold text-slate-900 dark:text-white">{item.product_name}</td>
                    <td className="py-4 px-5 text-right font-mono font-medium">{item.quantity}</td>
                    <td className="py-4 px-5 text-right font-mono">
                      Rs. {item.selling_price.toFixed(2)}
                    </td>
                    <td className="py-4 px-5 text-right font-mono font-bold text-slate-900 dark:text-white">
                      Rs. {item.total.toFixed(2)}
                    </td>
                    <td className="py-4 px-5 text-center">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded-lg text-xs font-bold transition-all"
                        onClick={() => onRemoveItem && onRemoveItem(index)}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span>Remove</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grand Total Section */}
      {items.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50/50 via-indigo-50/50 to-indigo-100/40 dark:from-slate-800/40 dark:via-slate-800/20 dark:to-indigo-950/20 rounded-2xl p-6 border border-indigo-100/50 dark:border-indigo-900/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
          <div>
            <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Total Summary</span>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-medium">
              Invoice contains {items.length} unique line {items.length === 1 ? 'item' : 'items'}
            </p>
          </div>
          <div className="text-right">
            <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">Grand Total</span>
            <p className="text-3xl font-extrabold text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text">
              Rs. {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}