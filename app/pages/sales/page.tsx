'use client';
import React, { useState, useEffect } from 'react';
import AddSalesPopup from '@/app/components/sales/add-sales-popup/page';
import SalesNavigation from '@/app/components/sales/sales-navigation/page';
import SalesInvoicePage from '@/app/components/sales/sales-invoice/page';

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

  useEffect(() => {
    async function fetchProducts(){
      try{
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
      alert(`"${productName}" already exists in the sales list. Please select a different product.`);
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
    if (!customerName || !saleDate) {
      alert("Please select a customer and an invoice date!");
      return;
    }
    if (saleItems.length === 0) {
      alert("Please add at least one product before saving!");
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
        alert("Invoice successfully saved to the database!");
        
        // Clear local states on success
        setSaleItems([]);
        setCustomerName("");
        setSaleDate("");
      } else {
        alert(result.message || "Failed to save data to the database.");
      }
    } catch (error) {
      console.error("Network connection error saving sale:", error);
      alert("A network connection error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50/50 dark:bg-slate-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <SalesNavigation />

        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 dark:from-blue-400 dark:to-blue-600 bg-clip-text text-transparent">
              💼 Sales Management
            </h1>
            <button 
              onClick={handleClick}
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
            >
              <span>➕</span>
              <span>Add Sale Item</span>
            </button>
          </div>
          <p className="text-gray-600 dark:text-gray-400">Manage your sales transactions efficiently</p>
        </div>

        {/* Popup Modal */}
        <AddSalesPopup isOpen={isPopupOpen} onClose={handleClosePopup}>
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Add New Sale Item</h2>
            <form onSubmit={addToList} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  🏷️ Product Name
                </label>
                {loading ? (
                  <p className="text-gray-500 py-3">Loading products...</p>
                ) : (
                  <select
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="w-full px-4 py-2.5 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:bg-gray-700 dark:text-white bg-white"
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
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    📦 Quantity
                  </label>
                  <input 
                    type="number"          
                    value={quantityPerProduct > 0 ? quantityPerProduct : ''}
                    onChange={(e) => setQuantityPerProduct(Number(e.target.value))}
                    className="w-full px-4 py-2.5 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:bg-gray-700 dark:text-white bg-white"
                    placeholder="0"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    💰 Selling Price
                  </label>
                  <input 
                    type="number"
                    step="0.01"
                    value={sellingPricePerProduct > 0 ? sellingPricePerProduct : ''}
                    onChange={(e) => setSellingPricePerProduct(Number(e.target.value))}
                    className="w-full px-4 py-2.5 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:bg-gray-700 dark:text-white bg-white"
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button 
                  type="submit"
                  className="w-full px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200"
                >
                  ✅ Add to List
                </button>
                <button
                  type="button"
                  onClick={handleClosePopup}
                  className="w-full px-4 py-3 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
                >
                  ❌ Cancel
                </button>
              </div>
            </form>
          </div>
        </AddSalesPopup>

        {/* Main Content Card */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8">
          <SalesInvoicePage
            items={saleItems}
            onRemoveItem={removeItem}
            customerName={customerName}
            saleDate={saleDate}
            onCustomerChange={setCustomerName}
            onSaleDateChange={setSaleDate}
          />

          {/* Confirm Sale Button */}
          <div className="mt-8 pt-6 border-t-2 border-gray-200 dark:border-gray-700">
            <button
              onClick={handleSubmitInvoice}
              disabled={isSubmitting || saleItems.length === 0}
              className="w-full px-6 py-4 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
            >
              {isSubmitting ? '⏳ Processing...' : '✨ Confirm Sale'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}