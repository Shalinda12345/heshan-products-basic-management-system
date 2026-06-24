'use client';
import React, { useState, useEffect } from 'react';
import AddSalesPopup from '@/app/components/sales/add-sales-popup/page';
import SalesNavigation from '@/app/components/sales/sales-navigation/page';
import SalesInvoicePage from '@/app/components/sales/sales-invoice/page';
import CustomAlert, { AlertVariant } from '@/app/components/ui/custom-alert/page';

type SaleItem = {
  product_name: string;
  quantity: number;
  selling_price: number;
  total: number;
};

interface Product {
  product_id: number;
  product_name: string;
}

export default function SalesPage() {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [quantityPerProduct, setQuantityPerProduct] = useState(0);
  const [sellingPricePerProduct, setSellingPricePerProduct] = useState(0);
  const [productName, setProductName] = useState("");
  const [actionButton, setActionButton] = useState<React.ReactNode>(null);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [customerName, setCustomerName] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  useEffect(() => {
    async function fetchProducts() {
      try {
        const response = await fetch("/api/products");
        if (!response.ok) throw new Error("Network response was not ok");
        const data = await response.json();
        setAllProducts(data);
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, []);

  const handleClick = () => {
    setIsPopupOpen(true);
  };

  const handleClosePopup = () => {
    setIsPopupOpen(false);
  };

  const removeItem = (index: number) => {
    setSaleItems((currentItems) => currentItems.filter((_, i) => i !== index));
  };

  const addToList = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!productName || quantityPerProduct <= 0 || sellingPricePerProduct <= 0) {
      return;
    }

    // Check if product already exists in the list
    const productExists = saleItems.some((item) => item.product_name === productName);
    if (productExists) {
      showAlert('warning', 'Duplicate Item', `"${productName}" is already in the invoice. Please select a different product.`);
      return;
    }

    const newItem: SaleItem = {
      product_name: productName,
      quantity: quantityPerProduct,
      selling_price: sellingPricePerProduct,
      total: quantityPerProduct * sellingPricePerProduct,
    };

    setSaleItems((currentItems) => [...currentItems, newItem]);
    setProductName("");
    setQuantityPerProduct(0);
    setActionButton(null);
    setSellingPricePerProduct(0);
    setIsPopupOpen(false);
  };

  const handleSubmitInvoice = async () => {
    if (!customerName) {
      showAlert('warning', 'Missing Customer', 'Please select a customer before posting the invoice.');
      return;
    }
    if (!saleDate) {
      showAlert('warning', 'Missing Date', 'Please select an invoice date before posting.');
      return;
    }
    if (saleItems.length === 0) {
      showAlert('warning', 'Empty Invoice', 'Please add at least one product before saving.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Calculate the total value from our tracked items list
      const grandTotal = saleItems.reduce((sum, item) => sum + item.total, 0);

      // 2. Format payloads to match what your InsertSales service properties expect
      const formattedItems = saleItems.map(item => ({
        product_name: item.product_name,
        quantity: item.quantity,
        selling_price: item.selling_price,
        total: item.total
      }));

      const response = await fetch("/api/sales/save-sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer_name: customerName,
          sale_date: saleDate,
          grand_total: grandTotal,
          items: formattedItems,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        showAlert('success', 'Success', 'Invoice successfully saved to the database!');

        // Clear local states on success
        setSaleItems([]);
        setCustomerName("");
        setSaleDate("");
      } else {
        showAlert('error', 'Save Failed', result.message || 'Failed to save data to the database.');
      }
    } catch (error) {
      console.error("Network connection error saving sale:", error);
      showAlert('error', 'Network Error', 'A network connection error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50/50 dark:bg-slate-900">
      <CustomAlert
        isOpen={alertState.isOpen}
        variant={alertState.variant}
        title={alertState.title}
        message={alertState.message}
        onClose={closeAlert}
      />
      <SalesNavigation />
      <div className="max-w-7xl mx-auto space-y-8 py-10 px-4 sm:px-6 lg:px-8">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 dark:border-slate-800 pb-6 gap-4">
          <div>
            <h1 className="text-4xl font-bold ">
              💼 Sales Management
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
              Create business invoices, and Add new transactions.
            </p>
          </div>
          <div>
            <button
              onClick={handleClick}
              disabled={loading}
              className="inline-flex items-center gap-2.5 px-6 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-500 dark:to-indigo-500 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl shadow-lg shadow-blue-500/10 hover:shadow-xl hover:shadow-blue-500/20 transform hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>Add Invoice Item</span>
            </button>
          </div>
        </div>

        {/* Popup Modal */}
        <AddSalesPopup isOpen={isPopupOpen} onClose={handleClosePopup}>
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Add Sale Item</h2>
            </div>

            <form onSubmit={addToList} className="space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                  Product Name
                </label>
                {loading ? (
                  <p className="text-slate-500 py-3 text-sm animate-pulse">Loading product inventory...</p>
                ) : (
                  <select
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 dark:bg-slate-900 dark:text-white bg-white transition-all text-sm font-medium"
                    required
                  >
                    <option value="">Select a product</option>
                    {allProducts.map((product) => (
                      <option key={product.product_id} value={product.product_name}>
                        {product.product_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                    Quantity
                  </label>
                  <input
                    type="number"
                    value={quantityPerProduct > 0 ? quantityPerProduct : ''}
                    onChange={(e) => setQuantityPerProduct(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 dark:bg-slate-900 dark:text-white bg-white transition-all text-sm font-medium"
                    placeholder="0"
                    min="1"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                    Unit Price (Rs.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={sellingPricePerProduct > 0 ? sellingPricePerProduct : ''}
                    onChange={(e) => setSellingPricePerProduct(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700/60 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 dark:bg-slate-900 dark:text-white bg-white transition-all text-sm font-medium"
                    placeholder="0.00"
                    min="0.01"
                    required
                  />
                </div>
              </div>

              {quantityPerProduct > 0 && sellingPricePerProduct > 0 && (
                <div className="p-3.5 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100/50 dark:border-blue-900/30 rounded-xl flex items-center justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Subtotal Preview:</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">
                    Rs. {(quantityPerProduct * sellingPricePerProduct).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClosePopup}
                  className="w-full px-4 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/60 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl transition-all duration-200 text-sm active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transform active:scale-95 transition-all duration-200 text-sm"
                >
                  Add to Invoice
                </button>
              </div>
            </form>
          </div>
        </AddSalesPopup>

        {/* Main Content Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none p-6 sm:p-8 border border-slate-200/60 dark:border-slate-800">
          <SalesInvoicePage
            items={saleItems}
            onRemoveItem={removeItem}
            customerName={customerName}
            saleDate={saleDate}
            onCustomerChange={setCustomerName}
            onSaleDateChange={setSaleDate}
          />

          {/* Confirm Sale Button */}
          {saleItems.length > 0 && (
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={handleSubmitInvoice}
                disabled={isSubmitting || saleItems.length === 0}
                className="w-full px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl shadow-lg hover:shadow-xl transform active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5.5 w-5.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Processing Transaction...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Post Invoice & Confirm Sale</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}