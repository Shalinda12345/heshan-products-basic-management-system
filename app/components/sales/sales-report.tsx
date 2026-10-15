'use client';

import React, { useState } from 'react';
import SalesNavigation from '@/app/components/sales/sales-navigation';
import ItemsSoldSummary, { type ItemsSoldSummaryProps } from '@/app/components/sales/items-sold-summary';
import { Notice } from '@/app/components/ui/feedback';
import { apiGet } from '@/app/lib/api-client';
import { isoDateFromDb } from '@/app/lib/dates';
import { formatAmount, formatDate } from '@/app/lib/format';
import { useResource } from '@/app/lib/use-resource';

interface Sale {
  sale_id: number;
  customer_name: string;
  grand_total: number;
  sale_date: string;
}

interface SaleItem {
  sale_detail_id: number;
  product_name: string;
  quantity: number;
  selling_price: number;
  total: number;
}

// The colour each report uses for its summary icon, period and spinners
const ACCENTS = {
  blue: { tile: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400', text: 'text-blue-400', spinner: 'border-blue-600', smallSpinner: 'border-blue-500' },
  indigo: { tile: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400', text: 'text-indigo-400', spinner: 'border-indigo-600', smallSpinner: 'border-indigo-500' },
  emerald: { tile: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', text: 'text-emerald-400', spinner: 'border-emerald-600', smallSpinner: 'border-emerald-500' },
};

const tabClass = (active: boolean) =>
  `inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 cursor-pointer ${
    active ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/70'
  }`;

export interface SalesReportProps {
  title: string;
  // Shown before the period, e.g. "Today's sales transactions and item metrics —"
  description: string;
  period: string;
  revenueLabel: string;
  icon: string;
  accent: keyof typeof ACCENTS;
  // Invoice numbers are shown as #<idPrefix>-<id>, and can be searched that way
  idPrefix: string;
  // The API listing the period's invoices
  url: string;
  emptyText: string;
  // Extra header controls, such as a month picker
  controls?: React.ReactNode;
  items: ItemsSoldSummaryProps;
}

// The daily, weekly, monthly and custom sales reports: the period's invoices (each expandable to its lines)
// and the items sold in it
export default function SalesReport({
  title, description, period, revenueLabel, icon, accent: accentName, idPrefix, url, emptyText, controls, items,
}: SalesReportProps) {
  const { data: sales, error, loading } = useResource<Sale[]>(url);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null);
  const [saleItems, setSaleItems] = useState<Record<number, SaleItem[]>>({});
  const [loadingItemsId, setLoadingItemsId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'invoices' | 'items'>('invoices');
  const accent = ACCENTS[accentName];

  const toggleExpandSale = async (saleId: number) => {
    if (expandedSaleId === saleId) {
      setExpandedSaleId(null);
      return;
    }
    setExpandedSaleId(saleId);
    if (saleItems[saleId]) return;

    setLoadingItemsId(saleId);
    try {
      const lines = await apiGet<SaleItem[]>(`/api/sales/get-sale-items?sale_id=${saleId}`);
      setSaleItems((prev) => ({ ...prev, [saleId]: lines }));
    } catch (error) {
      console.error('Error fetching sale items:', error);
    } finally {
      setLoadingItemsId(null);
    }
  };

  const query = searchQuery.toLowerCase();
  const filteredSales = (sales ?? []).filter((sale) =>
    sale.customer_name.toLowerCase().includes(query) ||
    `#${idPrefix.toLowerCase()}-${sale.sale_id}`.includes(query)
  );
  const totalRevenue = filteredSales.reduce((sum, s) => sum + Number(s.grand_total), 0);

  return (
    <main className="page-wrapper min-h-screen bg-slate-950">
      <div className="page-glow" />
      <SalesNavigation />
      <div className="page-content max-w-7xl mx-auto space-y-8 py-10 px-4 sm:px-6 lg:px-8">

        {/* Header Block */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between section-divider pb-6 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{title}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              {description} <span className={`font-semibold ${accent.text}`}>{period}</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {controls}
            <div className="glass-card-sm rounded-2xl p-5 flex items-center gap-4 min-w-[240px]">
              <div className={`flex items-center justify-center w-12 h-12 rounded-xl text-2xl ${accent.tile}`}>
                {icon}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{revenueLabel}</p>
                <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">Rs.{formatAmount(totalRevenue)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button onClick={() => setActiveTab('invoices')} className={tabClass(activeTab === 'invoices')}>
            <span>📋</span>
            <span>Transaction Invoices ({filteredSales.length})</span>
          </button>
          <button onClick={() => setActiveTab('items')} className={tabClass(activeTab === 'items')}>
            <span>📦</span>
            <span>Items Sold Breakdown</span>
          </button>
        </div>

        {activeTab === 'invoices' && (
          <div className="space-y-6">
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
                  placeholder="Search by customer name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-700 rounded-xl bg-slate-900/50 text-white text-sm focus:outline-none focus:border-blue-500 transition-all font-medium"
                />
              </div>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="ml-3 text-slate-400 hover:text-slate-200 text-xs font-semibold">
                  Clear
                </button>
              )}
            </div>

            {/* Invoices */}
            <div className="glass-card rounded-2xl overflow-hidden">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-24 space-y-4">
                  <div className={`w-10 h-10 border-4 border-t-transparent rounded-full animate-spin ${accent.spinner}`}></div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Loading invoices...</p>
                </div>
              ) : error ? (
                <div className="p-6">
                  <Notice tone="error" title="The invoices could not be loaded">{error}</Notice>
                </div>
              ) : filteredSales.length === 0 ? (
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
                        <th className="px-6 py-4 w-12"></th>
                        <th className="px-6 py-4">Transaction ID</th>
                        <th className="px-6 py-4">Account/Customer</th>
                        <th className="px-6 py-4">Posting Date</th>
                        <th className="px-6 py-4 text-right">Settled Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {filteredSales.map((sale) => {
                        const isExpanded = expandedSaleId === sale.sale_id;
                        const lines = saleItems[sale.sale_id];
                        return (
                          <React.Fragment key={sale.sale_id}>
                            <tr
                              onClick={() => toggleExpandSale(sale.sale_id)}
                              className="hover:bg-slate-800/40 cursor-pointer transition-colors duration-150"
                            >
                              <td className="px-6 py-4 text-center">
                                <span className={`inline-block transform transition-transform duration-200 text-slate-400 ${isExpanded ? 'rotate-90 text-blue-500' : ''}`}>
                                  ▶
                                </span>
                              </td>
                              <td className="px-6 py-4 font-mono text-xs text-slate-400 font-semibold">#{idPrefix}-{sale.sale_id}</td>
                              <td className="px-6 py-4 font-bold text-white">{sale.customer_name}</td>
                              <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{formatDate(isoDateFromDb(sale.sale_date))}</td>
                              <td className="px-6 py-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                Rs.{formatAmount(sale.grand_total)}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-slate-950/10">
                                <td colSpan={5} className="px-8 py-4 border-t border-b border-slate-800/80">
                                  <div className="bg-slate-950/20 rounded-xl p-5 border border-slate-800 space-y-4">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Transaction Breakdown</h4>
                                    {loadingItemsId === sale.sale_id ? (
                                      <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 py-4 text-sm font-medium">
                                        <div className={`w-4 h-4 border-2 border-t-transparent rounded-full animate-spin ${accent.smallSpinner}`}></div>
                                        <span>Loading the invoice lines...</span>
                                      </div>
                                    ) : !lines || lines.length === 0 ? (
                                      <p className="text-slate-400 py-3 text-sm">No items found for this transaction.</p>
                                    ) : (
                                      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                                        <table className="w-full text-xs text-left">
                                          <thead className="bg-slate-900 text-slate-400 uppercase font-bold tracking-wider border-b border-slate-800">
                                            <tr>
                                              <th className="py-2.5 px-4">Item Name</th>
                                              <th className="py-2.5 px-4 text-right">Quantity</th>
                                              <th className="py-2.5 px-4 text-right">Unit Price</th>
                                              <th className="py-2.5 px-4 text-right">Subtotal</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-800 font-medium">
                                            {lines.map((item) => (
                                              <tr key={item.sale_detail_id} className="text-slate-300">
                                                <td className="py-2.5 px-4 font-semibold text-white">{item.product_name}</td>
                                                <td className="py-2.5 px-4 text-right font-mono">{item.quantity}</td>
                                                <td className="py-2.5 px-4 text-right font-mono">Rs.{formatAmount(item.selling_price)}</td>
                                                <td className="py-2.5 px-4 text-right font-mono font-bold text-white">Rs.{formatAmount(item.total)}</td>
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
        )}

        {activeTab === 'items' && <ItemsSoldSummary {...items} />}
      </div>
    </main>
  );
}
