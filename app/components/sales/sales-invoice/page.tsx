"use client";

import React, {useState, useEffect} from "react";

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

export default function SalesInvoicePage({
  items,
  onRemoveItem,
  customerName,
  saleDate,
  onCustomerChange,
  onSaleDateChange,
}: SalesInvoicePageProps) {
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const grandTotal = items.reduce((sum, item) => sum + item.total, 0);

  useEffect(() => {
    async function fetchCustomers() {
      try{
        const response = await fetch("/api/customers");
        if (!response.ok) throw new Error("Network response was not ok");
        const data = await response.json();
        setAllCustomers(data);
      } catch (error){
        console.error("Error fetching customers:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchCustomers();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">📄 Sales Invoice</h1>
      </div>

      {/* Invoice Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Date Input */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            📅 Invoice Date
          </label>
          <input
            type="date"
            value={saleDate}
            onChange={(e) => onSaleDateChange(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:bg-gray-700 dark:text-white bg-white"
          />
        </div>

        {/* Customer Select */}
        <div>
          <label htmlFor="customer" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            👥 Select Customer
          </label>
          {loading ? (
            <div className="flex items-center justify-center py-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-500">
              Loading customers...
            </div>
          ) : (
            <select
              id="customer"
              value={customerName}
              onChange={(e) => onCustomerChange(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:bg-gray-700 dark:text-white bg-white"
            >
              <option value="">Select a Customer</option>
              {allCustomers.map((customer) => (
                <option key={customer.customer_id} value={customer.customer_name}>
                  {customer.customer_name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Sales Items Table */}
      <div className="overflow-x-auto rounded-lg border-2 border-gray-200 dark:border-gray-600">
        <table className="w-full bg-white dark:bg-slate-800">
          <thead className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-800 dark:to-blue-900 text-white">
            <tr>
              <th className="py-4 px-6 text-left font-semibold">#</th>
              <th className="py-4 px-6 text-left font-semibold">Product Name</th>
              <th className="py-4 px-6 text-right font-semibold">Quantity</th>
              <th className="py-4 px-6 text-right font-semibold">Unit Price</th>
              <th className="py-4 px-6 text-right font-semibold">Total</th>
              <th className="py-4 px-6 text-center font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 px-6 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <span className="text-4xl mb-2">📭</span>
                    <p className="text-gray-500 dark:text-gray-400 font-medium">
                      No sales items added yet. Start by adding a product above.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr 
                  key={`${item.product_name}-${index}`}
                  className="hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors duration-150"
                >
                  <td className="py-4 px-6 text-gray-900 dark:text-white font-semibold">{index + 1}</td>
                  <td className="py-4 px-6 text-gray-900 dark:text-white font-medium">{item.product_name}</td>
                  <td className="py-4 px-6 text-right text-gray-900 dark:text-white">{item.quantity}</td>
                  <td className="py-4 px-6 text-right text-gray-900 dark:text-white">
                    Rs. {item.selling_price.toFixed(2)}
                  </td>
                  <td className="py-4 px-6 text-right text-gray-900 dark:text-white font-semibold">
                    Rs. {item.total.toFixed(2)}
                  </td>
                  <td className="py-4 px-6 text-center">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 px-3 py-2 bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800 rounded-lg font-semibold transition-colors duration-150"
                      onClick={() => onRemoveItem(index)}
                    >
                      🗑️ Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Grand Total Section */}
      {items.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-700 dark:to-slate-600 rounded-lg p-6 border-2 border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-300 text-sm font-medium">Total Amount</p>
              <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text">
                Rs. {grandTotal.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}