"use client";

import SalesNavigation from '@/app/components/sales/sales-navigation/page';
import React, { useEffect, useState } from 'react';

interface Sale {
  sale_id: number;
  customer_name: string;
  grand_total: number;
  sale_date: string;
}

interface SaleItem {
  sale_detail_id: number;
  sale_id: number;
  product_name: string;
  quantity: number;
  selling_price: number;
  total: number;
}

export default function WeeklySales() {
  const [weeklySales, setWeeklySales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null);
  const [saleItems, setSaleItems] = useState<Record<number, SaleItem[]>>({});
  const [loadingItemsId, setLoadingItemsId] = useState<number | null>(null);

  useEffect(() => {
    async function fetchWeeklySales() {
      try {
        const response = await fetch("/api/sales/get-weekly-sales", { cache: 'no-store'});
        if (!response.ok) throw new Error("Network response was not ok");
        const data = await response.json();
        setWeeklySales(data);
      } catch (error) {
        console.error("Error fetching weekly sales:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchWeeklySales();
  }, []);

  const toggleExpandSale = async (saleId: number) => {
    if (expandedSaleId === saleId) {
      setExpandedSaleId(null);
      return;
    }

    setExpandedSaleId(saleId);

    if (saleItems[saleId]) return;

    setLoadingItemsId(saleId);
    try {
      const response = await fetch(`/api/sales/get-sale-items?sale_id=${saleId}`);
      if (!response.ok) throw new Error("Failed to fetch items");
      const data = await response.json();
      setSaleItems(prev => ({ ...prev, [saleId]: data }));
    } catch (error) {
      console.error("Error fetching sale items:", error);
    } finally {
      setLoadingItemsId(null);
    }
  };

  const filteredSales = weeklySales.filter(sale => 
    sale.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    `#w-sal-${sale.sale_id}`.includes(searchQuery.toLowerCase())
  );

  const totalRevenue = filteredSales.reduce((sum, s) => sum + Number(s.grand_total), 0);

  return (
    <main className="min-h-screen bg-slate-50/50 dark:bg-slate-900">
      <SalesNavigation />
      <div className="max-w-7xl mx-auto space-y-8 py-10 px-4 sm:px-6 lg:px-8">

        {/* Header Block */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 dark:border-slate-800 pb-6 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Weekly Statements</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Review operational performance metrics for the current week cycles.</p>
          </div>
          
          {/* Executive Summary Widget */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl p-5 flex items-center gap-4 shadow-sm min-w-[280px]">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-2xl">
              📈
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">This Week's Revenue</p>
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                Rs.{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
              placeholder="Search by customer name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:border-blue-500 transition-all font-medium"
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
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Aggregating weekly ledger statements...</p>
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="text-center py-20 text-slate-400 dark:text-slate-500">
              <span className="text-5xl block mb-4">📭</span>
              <p className="text-base font-semibold">No sales operations logged for this weekly bracket.</p>
              {searchQuery && <p className="text-xs text-slate-500 mt-1">Try modifying your search criteria.</p>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 uppercase text-xs font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <th className="px-6 py-4 w-12"></th>
                    <th className="px-6 py-4">Transaction ID</th>
                    <th className="px-6 py-4">Account/Customer</th>
                    <th className="px-6 py-4">Posting Date</th>
                    <th className="px-6 py-4 text-right">Settled Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {filteredSales.map((sale) => {
                    const isExpanded = expandedSaleId === sale.sale_id;
                    return (
                      <React.Fragment key={sale.sale_id}>
                        <tr 
                          onClick={() => toggleExpandSale(sale.sale_id)}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-700/40 cursor-pointer transition-colors duration-150"
                        >
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-block transform transition-transform duration-200 text-slate-400 ${isExpanded ? "rotate-90 text-blue-500" : ""}`}>
                              ▶
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-slate-400 font-semibold">#W-SAL-{sale.sale_id}</td>
                          <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">{sale.customer_name}</td>
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                            {new Date(sale.sale_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            Rs.{Number(sale.grand_total).toFixed(2)}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50/30 dark:bg-slate-900/10">
                            <td colSpan={5} className="px-8 py-4 border-t border-b border-slate-100 dark:border-slate-800/80">
                              <div className="bg-slate-50/70 dark:bg-slate-900/40 rounded-xl p-5 border border-slate-200/50 dark:border-slate-800 space-y-4">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Transaction Breakdown</h4>
                                {loadingItemsId === sale.sale_id ? (
                                  <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 py-4 text-sm font-medium">
                                    <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                    <span>Fetching transaction breakdown...</span>
                                  </div>
                                ) : !saleItems[sale.sale_id] || saleItems[sale.sale_id].length === 0 ? (
                                  <p className="text-slate-400 py-3 text-sm">No items found for this transaction.</p>
                                ) : (
                                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                                    <table className="w-full text-xs text-left">
                                      <thead className="bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                                        <tr>
                                          <th className="py-2.5 px-4">Item Name</th>
                                          <th className="py-2.5 px-4 text-right">Quantity</th>
                                          <th className="py-2.5 px-4 text-right">Unit Price</th>
                                          <th className="py-2.5 px-4 text-right">Subtotal</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
                                        {saleItems[sale.sale_id].map((item) => (
                                          <tr key={item.sale_detail_id} className="text-slate-700 dark:text-slate-300">
                                            <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white">{item.product_name}</td>
                                            <td className="py-2.5 px-4 text-right font-mono">{item.quantity}</td>
                                            <td className="py-2.5 px-4 text-right font-mono">Rs.{item.selling_price.toFixed(2)}</td>
                                            <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">Rs.{item.total.toFixed(2)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}