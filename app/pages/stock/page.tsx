'use client';

import React, { useState, useEffect } from 'react';
import CustomAlert, { AlertVariant } from '@/app/components/ui/custom-alert/page';

interface Product {
  product_id: number;
  product_name: string;
  description: string;
}

interface StockItem {
  product_id: number;
  product_name: string;
  description: string;
  quantity: number;
}

export default function StockPage() {
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  
  // Form states
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantityToAdd, setQuantityToAdd] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>("");

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

  // Fetch stock levels and products list
  const fetchStockData = async () => {
    try {
      const response = await fetch("/api/stock", { cache: 'no-store' });
      if (!response.ok) throw new Error("Failed to fetch stock");
      const data = await response.json();
      setStockItems(data);
    } catch (error: unknown) {
      console.error("Error fetching stock:", error);
      showAlert('error', 'Error', 'Failed to retrieve stock levels.');
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await fetch("/api/products");
      if (!response.ok) throw new Error("Failed to fetch products");
      const data = await response.json();
      setAllProducts(data);
    } catch (error: unknown) {
      console.error("Error fetching products:", error);
    }
  };

  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      await Promise.all([fetchStockData(), fetchProducts()]);
      setLoading(false);
    };
    initializeData();
  }, []);

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || quantityToAdd <= 0) {
      showAlert('warning', 'Invalid Input', 'Please select a product and enter a positive quantity.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/stock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_id: Number(selectedProductId),
          quantity: quantityToAdd,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Refresh local data
        await fetchStockData();
        
        // Find product name for success alert
        const prod = allProducts.find(p => p.product_id === Number(selectedProductId));
        showAlert('success', 'Stock Added', `Successfully added ${quantityToAdd} units of "${prod?.product_name || 'Product'}".`);
        
        // Reset form
        setSelectedProductId("");
        setQuantityToAdd(0);
      } else {
        showAlert('error', 'Action Failed', result.error || 'Failed to record stock addition.');
      }
    } catch (error: unknown) {
      console.error("Error adding stock:", error);
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

  const getStockBadge = (quantity: number) => {
    if (quantity <= 0) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-950/30 text-red-400 border border-red-900/30">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          Out of Stock ({quantity})
        </span>
      );
    }
    if (quantity < 10) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/30 text-amber-400 border border-amber-900/30">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          Low Stock ({quantity})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/30 text-emerald-400 border border-emerald-900/30">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        In Stock ({quantity})
      </span>
    );
  };

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
        <div className="section-divider pb-6">
          <h1 className="text-4xl font-bold text-slate-100">
            📦 Stock Management
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
            Manage product inventory, monitor live stock levels, and log inward stock adjustments.
          </p>
        </div>

        {/* Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COLUMN: Record Form (5 Cols) */}
          <div className="lg:col-span-5 glass-card rounded-2xl p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">Record Stock Inflow</h2>
            </div>

            <form onSubmit={handleAddStock} className="space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                  Select Product
                </label>
                {loading ? (
                  <p className="text-slate-400 py-3 text-sm animate-pulse">Loading products...</p>
                ) : (
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-900/30 bg-slate-900 text-white text-sm font-medium transition-all"
                    required
                  >
                    <option value="">Choose product</option>
                    {allProducts.map((product) => (
                      <option key={product.product_id} value={product.product_id}>
                        {product.product_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                  Quantity to Add
                </label>
                <input
                  type="number"
                  value={quantityToAdd > 0 ? quantityToAdd : ''}
                  onChange={(e) => setQuantityToAdd(Number(e.target.value))}
                  className="w-full px-4 py-3 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-900/30 bg-slate-900 text-white text-sm font-medium transition-all"
                  placeholder="0"
                  min="1"
                  required
                />
              </div>

              <div className="pt-2">
                {selectedProductId === "" ? (
                  <p className="text-xs font-semibold text-center text-slate-400 dark:text-slate-500">
                    Select a product and quantity to submit.
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
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Add Stock</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* RIGHT COLUMN: Table (7 Cols) - Placed in top right corner */}
          <div className="lg:col-span-7 glass-card rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <svg className="w-5.5 h-5.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Stock Levels</span>
              </h2>
              
              {/* Search filter */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-60 pl-10 pr-4 py-2 border border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-900/30 bg-slate-900 text-white text-xs font-semibold transition-all"
                />
                <div className="absolute left-3 top-2.5 text-slate-400 dark:text-slate-500 pointer-events-none">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl glass-card-sm">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/40 text-slate-400 uppercase text-xs font-bold tracking-wider border-b border-slate-800">
                    <th className="py-4 px-5 text-center w-16">ID</th>
                    <th className="py-4 px-5">Product Name</th>
                    <th className="py-4 px-5">Description</th>
                    <th className="py-4 px-5 text-right w-44">Remaining Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="py-4.5 px-5"><div className="h-4 bg-slate-800 rounded w-8 mx-auto" /></td>
                        <td className="py-4.5 px-5"><div className="h-4 bg-slate-800 rounded w-32" /></td>
                        <td className="py-4.5 px-5"><div className="h-4 bg-slate-800 rounded w-48" /></td>
                        <td className="py-4.5 px-5 text-right"><div className="h-6 bg-slate-800 rounded w-24 ml-auto" /></td>
                      </tr>
                    ))
                  ) : filteredStock.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 px-5 text-center">
                        <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-3">
                          <div className="p-3 bg-slate-900 rounded-full border border-slate-800">
                            <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-slate-200 font-bold text-sm">No items found</p>
                            <p className="text-slate-400 text-xs mt-1">
                              {searchQuery ? "No products match your search query." : "There are no products registered in the database."}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredStock.map((item) => (
                      <tr
                        key={item.product_id}
                        className="hover:bg-slate-800/40 transition duration-150 group"
                      >
                        <td className="py-4 px-5 text-center font-medium text-slate-500 text-xs">
                          {item.product_id}
                        </td>
                        <td className="py-4 px-5 font-semibold text-white">
                          {item.product_name}
                        </td>
                        <td className="py-4 px-5 text-slate-400 text-xs">
                          {item.description}
                        </td>
                        <td className="py-4 px-5 text-right font-medium">
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
      </div>
    </main>
  );
}
