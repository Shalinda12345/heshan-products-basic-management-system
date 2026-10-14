'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import CustomAlert, { AlertVariant } from '@/app/components/ui/custom-alert';
import { backgroundFetch, useLiveRefresh } from '@/app/lib/use-live-refresh';
import { toIsoDate } from '@/app/lib/dates';
import {
  LOW_STOCK_THRESHOLD,
  MANUAL_MOVEMENT_TYPES,
  movementLabel,
  stockStatus,
  type MovementType,
  type StockDirection,
} from '@/app/lib/stock';

interface StockItem {
  product_id: number;
  product_name: string;
  description: string;
  quantity: number;
  today_in: number;
  today_out: number;
}

interface StockMovement {
  movement_id: number;
  product_id: number;
  product_name: string;
  direction: StockDirection;
  movement_type: string;
  quantity: number;
  balance_after: number;
  reference: string | null;
  note: string | null;
  movement_date: string;
  created_at: string | null;
}

const LIVE_REFRESH_MS = 5000;
const LEDGER_LIMIT = 100;

const fmtQty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

const inputClass =
  'w-full px-4 py-3 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-900/30 bg-slate-900 text-white text-sm font-medium transition-all';
const labelClass = 'block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2';
const filterClass =
  'px-3 py-2 border border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 bg-slate-900 text-white text-xs font-semibold';

export default function StockPage() {
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [connectionLost, setConnectionLost] = useState<boolean>(false);
  const [freshIds, setFreshIds] = useState<Set<number>>(new Set());
  const latestMovementId = useRef<number | null>(null);

  // Movement form
  const [direction, setDirection] = useState<StockDirection>('IN');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(0);
  const [movementType, setMovementType] = useState<MovementType>(MANUAL_MOVEMENT_TYPES.IN[0]);
  const [movementDate, setMovementDate] = useState<string>(() => toIsoDate(new Date()));
  const [note, setNote] = useState<string>('');

  // Stock table + ledger filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [ledgerProductId, setLedgerProductId] = useState<string>('');
  const [ledgerDirection, setLedgerDirection] = useState<'' | StockDirection>('');
  const [ledgerFrom, setLedgerFrom] = useState<string>('');
  const [ledgerTo, setLedgerTo] = useState<string>('');

  const [alertState, setAlertState] = useState<{ isOpen: boolean; variant: AlertVariant; title: string; message: string }>({
    isOpen: false,
    variant: 'info',
    title: '',
    message: '',
  });

  const showAlert = useCallback((variant: AlertVariant, title: string, message: string) => {
    setAlertState({ isOpen: true, variant, title, message });
  }, []);

  const closeAlert = () => {
    setAlertState(prev => ({ ...prev, isOpen: false }));
  };

  const ledgerQuery = (() => {
    const params = new URLSearchParams({ limit: String(LEDGER_LIMIT) });
    if (ledgerProductId) params.set('product_id', ledgerProductId);
    if (ledgerDirection) params.set('direction', ledgerDirection);
    if (ledgerFrom) params.set('from', ledgerFrom);
    if (ledgerTo) params.set('to', ledgerTo);
    return params.toString();
  })();

  // Loads stock levels and the ledger together so both always describe the same moment
  const loadData = useCallback(async () => {
    try {
      const [stockRes, movementsRes] = await Promise.all([
        backgroundFetch('/api/stock'),
        backgroundFetch(`/api/stock/movements?${ledgerQuery}`),
      ]);
      if (!stockRes.ok || !movementsRes.ok) throw new Error('Failed to fetch stock');
      const [stockData, movementData]: [StockItem[], StockMovement[]] = await Promise.all([stockRes.json(), movementsRes.json()]);

      // Highlight movements that arrived since the previous refresh
      const previousLatest = latestMovementId.current;
      const newestId = movementData.reduce((max, m) => Math.max(max, m.movement_id), previousLatest ?? 0);
      if (previousLatest !== null) {
        const arrived = movementData.filter(m => m.movement_id > previousLatest).map(m => m.movement_id);
        if (arrived.length > 0) {
          setFreshIds(new Set(arrived));
          setTimeout(() => setFreshIds(new Set()), 4000);
        }
      }
      latestMovementId.current = newestId;

      setStockItems(stockData);
      setMovements(movementData);
      setLastUpdated(new Date().toLocaleTimeString());
      setConnectionLost(false);
    } catch (error: unknown) {
      console.error('Error fetching stock:', error);
      setConnectionLost(true);
      throw error;
    }
  }, [ledgerQuery]);

  useEffect(() => {
    let cancelled = false;
    loadData()
      .catch(() => {
        if (!cancelled) showAlert('error', 'Error', 'Failed to retrieve stock levels.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadData, showAlert]);

  useLiveRefresh(loadData, LIVE_REFRESH_MS, !loading);

  const selectedProduct = stockItems.find(p => p.product_id === Number(selectedProductId));
  const projectedBalance = selectedProduct
    ? selectedProduct.quantity + (direction === 'IN' ? quantity : -quantity)
    : null;

  const switchDirection = (next: StockDirection) => {
    setDirection(next);
    setMovementType(MANUAL_MOVEMENT_TYPES[next][0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || quantity <= 0) {
      showAlert('warning', 'Invalid Input', 'Please select a product and enter a positive quantity.');
      return;
    }
    if (direction === 'OUT' && selectedProduct && quantity > selectedProduct.quantity) {
      showAlert('warning', 'Insufficient Stock', `Only ${fmtQty(selectedProduct.quantity)} units of "${selectedProduct.product_name}" are in stock.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: Number(selectedProductId),
          quantity,
          direction,
          movement_type: movementType,
          movement_date: movementDate,
          note,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        const name = selectedProduct?.product_name || 'Product';
        await loadData().catch(() => undefined);
        if (direction === 'IN') {
          showAlert('success', 'Stock Added', `Successfully added ${fmtQty(quantity)} units of "${name}". New balance: ${fmtQty(result.data.quantity)}.`);
        } else {
          showAlert('success', 'Stock Removed', `Removed ${fmtQty(quantity)} units of "${name}" (${movementLabel(movementType)}). New balance: ${fmtQty(result.data.quantity)}.`);
        }
        setSelectedProductId('');
        setQuantity(0);
        setNote('');
      } else {
        showAlert('error', 'Action Failed', result.error || 'Failed to record the stock movement.');
      }
    } catch (error: unknown) {
      console.error('Error recording stock movement:', error);
      showAlert('error', 'Network Error', 'A connection error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter stock items by search query
  const filteredStock = stockItems.filter(item =>
    item.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totals = {
    units: stockItems.reduce((sum, item) => sum + Math.max(item.quantity, 0), 0),
    low: stockItems.filter(item => stockStatus(item.quantity) === 'low').length,
    out: stockItems.filter(item => stockStatus(item.quantity) === 'out').length,
    todayIn: stockItems.reduce((sum, item) => sum + item.today_in, 0),
    todayOut: stockItems.reduce((sum, item) => sum + item.today_out, 0),
  };

  const ledgerFiltered = ledgerProductId || ledgerDirection || ledgerFrom || ledgerTo;

  const getStockBadge = (qty: number) => {
    const status = stockStatus(qty);
    if (status === 'out') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-950/30 text-red-400 border border-red-900/30">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          Out of Stock ({fmtQty(qty)})
        </span>
      );
    }
    if (status === 'low') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/30 text-amber-400 border border-amber-900/30">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          Low Stock ({fmtQty(qty)})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/30 text-emerald-400 border border-emerald-900/30">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        In Stock ({fmtQty(qty)})
      </span>
    );
  };

  const kpis = [
    { label: 'Products', value: String(stockItems.length), hint: 'Tracked items', tone: 'text-slate-100' },
    { label: 'Units on Hand', value: fmtQty(totals.units), hint: 'Across all products', tone: 'text-sky-300' },
    { label: 'Low Stock', value: String(totals.low), hint: `Below ${LOW_STOCK_THRESHOLD} units`, tone: totals.low > 0 ? 'text-amber-400' : 'text-slate-100' },
    { label: 'Out of Stock', value: String(totals.out), hint: 'Nothing left to sell', tone: totals.out > 0 ? 'text-red-400' : 'text-slate-100' },
    { label: 'Today In', value: `+${fmtQty(totals.todayIn)}`, hint: 'Units received today', tone: 'text-emerald-400' },
    { label: 'Today Out', value: `−${fmtQty(totals.todayOut)}`, hint: 'Units sold or removed', tone: 'text-rose-400' },
  ];

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
      <div className="page-content max-w-7xl mx-auto space-y-8 py-10 px-4 sm:px-6 lg:px-8">

        {/* Header Section */}
        <div className="section-divider pb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-slate-100">
              📦 Stock Control
            </h1>
            <p className="text-slate-400 mt-2 text-sm">
              Live stock levels with every unit in and out recorded in the movement ledger.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold" aria-live="polite">
            {connectionLost ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-amber-400">Reconnecting… {lastUpdated && `last update ${lastUpdated}`}</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse" />
                <span className="text-emerald-400 uppercase tracking-wider">Live</span>
                {lastUpdated && <span className="text-slate-500">· updated {lastUpdated}</span>}
              </>
            )}
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4" data-testid="stock-kpis">
          {kpis.map(kpi => (
            <div key={kpi.label} className="glass-card-sm rounded-2xl p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{kpi.label}</p>
              <p className={`text-2xl font-extrabold mt-1 font-mono ${kpi.tone}`}>{loading ? '—' : kpi.value}</p>
              <p className="text-[11px] text-slate-500 mt-1">{kpi.hint}</p>
            </div>
          ))}
        </div>

        {/* Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* LEFT COLUMN: Movement form */}
          <div className="lg:col-span-5 glass-card rounded-2xl p-6 sm:p-8">
            <h2 className="text-xl font-bold text-white mb-5">Record Stock Movement</h2>

            {/* In / Out toggle */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-950/60 border border-slate-800 mb-6" role="group" aria-label="Movement direction">
              <button
                type="button"
                onClick={() => switchDirection('IN')}
                aria-pressed={direction === 'IN'}
                className={`py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer ${direction === 'IN' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20' : 'text-slate-400 hover:text-slate-200'}`}
              >
                ▲ Stock In
              </button>
              <button
                type="button"
                onClick={() => switchDirection('OUT')}
                aria-pressed={direction === 'OUT'}
                className={`py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer ${direction === 'OUT' ? 'bg-rose-600 text-white shadow-md shadow-rose-500/20' : 'text-slate-400 hover:text-slate-200'}`}
              >
                ▼ Stock Out
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" aria-label="Stock movement form">
              <div>
                <label className={labelClass}>Product</label>
                {loading ? (
                  <p className="text-slate-400 py-3 text-sm animate-pulse">Loading products...</p>
                ) : (
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className={inputClass}
                    required
                  >
                    <option value="">Choose product</option>
                    {stockItems.map((product) => (
                      <option key={product.product_id} value={product.product_id}>
                        {product.product_name} — {fmtQty(product.quantity)} in stock
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Quantity</label>
                  <input
                    type="number"
                    value={quantity > 0 ? quantity : ''}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className={inputClass}
                    placeholder="0"
                    min="0.01"
                    step="any"
                    max={direction === 'OUT' && selectedProduct ? selectedProduct.quantity : undefined}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>Date</label>
                  <input
                    type="date"
                    value={movementDate}
                    max={toIsoDate(new Date())}
                    onChange={(e) => setMovementDate(e.target.value)}
                    className={inputClass}
                    required
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Reason</label>
                <select
                  value={movementType}
                  onChange={(e) => setMovementType(e.target.value as MovementType)}
                  className={inputClass}
                >
                  {MANUAL_MOVEMENT_TYPES[direction].map(type => (
                    <option key={type} value={type}>{movementLabel(type)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>Note (optional)</label>
                <input
                  type="text"
                  value={note}
                  maxLength={255}
                  onChange={(e) => setNote(e.target.value)}
                  className={inputClass}
                  placeholder={direction === 'IN' ? 'e.g. Morning batch, supplier invoice no.' : 'e.g. Spoiled in transport'}
                />
              </div>

              {selectedProduct && (
                <div className={`p-3.5 rounded-xl border flex items-center justify-between text-sm ${direction === 'IN' ? 'bg-emerald-950/20 border-emerald-900/30' : 'bg-rose-950/20 border-rose-900/30'}`}>
                  <span className="text-slate-400">
                    Current <span className="font-bold text-white">{fmtQty(selectedProduct.quantity)}</span>
                    {quantity > 0 && <> → after <span className="font-bold text-white">{fmtQty(projectedBalance ?? 0)}</span></>}
                  </span>
                  {projectedBalance !== null && projectedBalance < 0 && (
                    <span className="text-xs font-bold text-rose-400">Exceeds stock</span>
                  )}
                </div>
              )}

              <div className="pt-1">
                {selectedProductId === '' ? (
                  <p className="text-xs font-semibold text-center text-slate-500">
                    Select a product and quantity to submit.
                  </p>
                ) : (
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`w-full px-6 py-4 bg-gradient-to-r ${direction === 'IN' ? 'from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700' : 'from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700'} disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-base rounded-xl shadow-lg transform active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer`}
                  >
                    {isSubmitting ? 'Submitting...' : direction === 'IN' ? 'Add Stock' : 'Remove Stock'}
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* RIGHT COLUMN: Stock levels */}
          <div className="lg:col-span-7 glass-card rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <h2 className="text-xl font-bold text-white">Stock Levels</h2>
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-60 px-4 py-2 border border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-900/30 bg-slate-900 text-white text-xs font-semibold transition-all"
              />
            </div>

            <div className="overflow-x-auto rounded-xl glass-card-sm">
              <table className="w-full text-sm text-left border-collapse" aria-label="Stock levels">
                <thead>
                  <tr className="bg-slate-950/40 text-slate-400 uppercase text-xs font-bold tracking-wider border-b border-slate-800">
                    <th className="py-4 px-5">Product</th>
                    <th className="py-4 px-4 text-right">Today In</th>
                    <th className="py-4 px-4 text-right">Today Out</th>
                    <th className="py-4 px-5 text-right w-44">On Hand</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="py-4 px-5"><div className="h-4 bg-slate-800 rounded w-32" /></td>
                        <td className="py-4 px-4"><div className="h-4 bg-slate-800 rounded w-10 ml-auto" /></td>
                        <td className="py-4 px-4"><div className="h-4 bg-slate-800 rounded w-10 ml-auto" /></td>
                        <td className="py-4 px-5"><div className="h-6 bg-slate-800 rounded w-24 ml-auto" /></td>
                      </tr>
                    ))
                  ) : filteredStock.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 px-5 text-center">
                        <p className="text-slate-200 font-bold text-sm">No items found</p>
                        <p className="text-slate-400 text-xs mt-1">
                          {searchQuery ? 'No products match your search query.' : 'There are no products registered in the database.'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredStock.map((item) => (
                      <tr
                        key={item.product_id}
                        onClick={() => setLedgerProductId(String(item.product_id))}
                        title="Show this product's movements"
                        className={`hover:bg-slate-800/40 transition duration-150 cursor-pointer ${ledgerProductId === String(item.product_id) ? 'bg-indigo-950/30' : ''}`}
                      >
                        <td className="py-3.5 px-5">
                          <p className="font-semibold text-white">{item.product_name}</p>
                          <p className="text-slate-500 text-xs">{item.description}</p>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-sm">
                          {item.today_in > 0 ? <span className="text-emerald-400 font-bold">+{fmtQty(item.today_in)}</span> : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-sm">
                          {item.today_out > 0 ? <span className="text-rose-400 font-bold">−{fmtQty(item.today_out)}</span> : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="py-3.5 px-5 text-right font-medium">
                          {getStockBadge(item.quantity)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Movement ledger */}
        <section className="glass-card rounded-2xl p-6" aria-label="Stock movement ledger">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
            <div>
              <h2 className="text-xl font-bold text-white">Stock Movement Ledger</h2>
              <p className="text-xs text-slate-500 mt-1">
                Every stock in and out — sales, returns, write-offs and manual entries. Latest {LEDGER_LIMIT} shown.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Filter by product" value={ledgerProductId} onChange={(e) => setLedgerProductId(e.target.value)} className={filterClass}>
                <option value="">All products</option>
                {stockItems.map(p => <option key={p.product_id} value={p.product_id}>{p.product_name}</option>)}
              </select>
              <select aria-label="Filter by direction" value={ledgerDirection} onChange={(e) => setLedgerDirection(e.target.value as '' | StockDirection)} className={filterClass}>
                <option value="">In &amp; Out</option>
                <option value="IN">In only</option>
                <option value="OUT">Out only</option>
              </select>
              <input aria-label="From date" type="date" value={ledgerFrom} max={ledgerTo || undefined} onChange={(e) => setLedgerFrom(e.target.value)} className={filterClass} />
              <span className="text-slate-500 text-xs">to</span>
              <input aria-label="To date" type="date" value={ledgerTo} min={ledgerFrom || undefined} onChange={(e) => setLedgerTo(e.target.value)} className={filterClass} />
              {ledgerFiltered && (
                <button
                  type="button"
                  onClick={() => { setLedgerProductId(''); setLedgerDirection(''); setLedgerFrom(''); setLedgerTo(''); }}
                  className="text-xs font-semibold text-slate-400 hover:text-slate-200 px-2"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl glass-card-sm">
            <table className="w-full text-sm text-left border-collapse" aria-label="Stock movements">
              <thead>
                <tr className="bg-slate-950/40 text-slate-400 uppercase text-xs font-bold tracking-wider border-b border-slate-800">
                  <th className="py-3.5 px-4 whitespace-nowrap">Date</th>
                  <th className="py-3.5 px-4">Product</th>
                  <th className="py-3.5 px-4">Movement</th>
                  <th className="py-3.5 px-4">Reference</th>
                  <th className="py-3.5 px-4 text-right">In</th>
                  <th className="py-3.5 px-4 text-right">Out</th>
                  <th className="py-3.5 px-4 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {loading ? (
                  <tr><td colSpan={7} className="py-10 text-center text-slate-500 text-sm animate-pulse">Loading movements...</td></tr>
                ) : movements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <p className="text-slate-200 font-bold text-sm">No stock movements</p>
                      <p className="text-slate-400 text-xs mt-1">
                        {ledgerFiltered ? 'Nothing matches these filters.' : 'Movements appear here as stock is received, sold or removed.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => {
                    const isIn = m.direction === 'IN';
                    return (
                      <tr key={m.movement_id} className={`transition-colors duration-700 ${freshIds.has(m.movement_id) ? 'bg-indigo-500/15' : 'hover:bg-slate-800/40'}`}>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <p className="text-slate-200 font-medium">{new Date(m.movement_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
                          {m.created_at && (
                            <p className="text-[11px] text-slate-500">
                              {new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 font-semibold text-white">{m.product_name}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${isIn ? 'bg-emerald-950/30 text-emerald-400 border-emerald-900/40' : 'bg-rose-950/30 text-rose-400 border-rose-900/40'}`}>
                            {movementLabel(m.movement_type)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <p className="text-slate-300 font-mono">{m.reference ?? '—'}</p>
                          {m.note && <p className="text-slate-500 mt-0.5">{m.note}</p>}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">{isIn ? `+${fmtQty(m.quantity)}` : ''}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-rose-400">{isIn ? '' : `−${fmtQty(m.quantity)}`}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-200">{fmtQty(m.balance_after)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
