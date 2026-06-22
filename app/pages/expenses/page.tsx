'use client';
import ExpensesNavigation from "@/app/components/expenses/expenses-navigation/page";
import { useEffect, useState, FormEvent } from "react";

interface Expenses {
    expense_name: string;
    quantity: number;
    per_expense_amount: number;
    total: number;
}

interface Expense_Item_List {
    expense_id: number;
    expense_name: string;
}

export default function ExpensesPage() {
    const [expenseName, setExpenseName] = useState("");
    const [allExpenseItems, setAllExpenseItems] = useState<Expense_Item_List[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [quantityPerProduct, setQuantityPerProduct] = useState(0);
    const [amount, setAmount] = useState(0);
    const [expenseDate, setExpenseDate] = useState("");

    useEffect(() => {
        async function fetchExpenseItemsList() {
            try {
                const response = await fetch("/api/expenses/get-expense-item-list");
                if (!response.ok) throw new Error("Network response was not ok");
                const data = await response.json();
                setAllExpenseItems(data);
            } catch (error) {
                console.error("Error fetching products:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchExpenseItemsList();
    }, []);

    // Check if the current expense requires a quantity breakdown
    const requiresQuantity = ["Milk Packet(900ml)", "Sugar", "Watalappan Cup", "Drink Cup"].includes(expenseName);

    // Purely returns calculations without breaking React's render loop
    const calculatedTotal = requiresQuantity ? quantityPerProduct * amount : amount;

    const addToExpenseList = async (e: FormEvent) => {
        e.preventDefault(); // FIX: Prevents page reload
        setIsSubmitting(true);

        try {
            const response = await fetch("/api/expenses/save-expenses", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    expense_name: expenseName,
                    quantity: requiresQuantity ? quantityPerProduct : 1, // Default to 1 if no qty field
                    per_expense_amount: amount,
                    total: calculatedTotal, // FIX: Pass the fresh calculated value directly
                    expense_date: expenseDate
                }),
            });

            const result = await response.json();

            if (response.ok && result.success) {
                alert("Expense successfully saved to the database!");
                // Clear local states on success
                setExpenseName("");
                setExpenseDate("");
                setQuantityPerProduct(0);
                setAmount(0);
            } else {
                alert(result.message || "Failed to save data to the database.");
            }
        } catch (error) {
            console.error("Network connection error saving expense:", error);
            alert("A network connection error occurred. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="min-h-screen bg-slate-50/50 dark:bg-slate-900 py-8 px-4 sm:px-6 lg:px-8">
              <div className="max-w-7xl mx-auto space-y-8">
                <ExpensesNavigation />
                
                <div className="p-6 max-w-lg mx-auto">
                    <form onSubmit={addToExpenseList} className="space-y-4">
                        <div>
                            <h1 className="text-xl font-bold mb-4">Add New Expense</h1>
                            
                            <div className="mb-4">
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    📅 Invoice Date
                                </label>
                                <input
                                    type="date"
                                    value={expenseDate}
                                    onChange={(e) => setExpenseDate(e.target.value)}
                                    className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:bg-gray-700 dark:text-white bg-white"
                                    required
                                />
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Expense Item</label>
                                <select 
                                    value={expenseName}
                                    onChange={(e) => {
                                        setExpenseName(e.target.value);
                                        setQuantityPerProduct(0); // Reset variables on switch
                                        setAmount(0);
                                    }}
                                    className="w-full px-4 py-2.5 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:bg-gray-700 dark:text-white bg-white"
                                    required
                                >
                                    <option value="">Select Expense Item</option>
                                    {allExpenseItems.map((expense) => (
                                        <option key={expense.expense_id} value={expense.expense_name}>
                                            {expense.expense_name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {requiresQuantity ? (
                                <div className="space-y-4">
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
                                            💰 Per-Expense Amount
                                        </label>
                                        <input 
                                            type="number"
                                            step="0.01"
                                            value={amount > 0 ? amount : ''}
                                            onChange={(e) => setAmount(Number(e.target.value))}
                                            className="w-full px-4 py-2.5 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:bg-gray-700 dark:text-white bg-white"
                                            placeholder="0.00"
                                            required
                                        />
                                    </div>
                                    <div className="block text-sm font-bold text-blue-600 dark:text-blue-400 mt-2">
                                        Total: Rs.{calculatedTotal.toFixed(2)}
                                    </div>
                                </div>
                            ) : (
                                expenseName !== "" && (
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                            💰 Expense Amount
                                        </label>
                                        <input 
                                            type="number"
                                            step="0.01"
                                            value={amount > 0 ? amount : ''}
                                            onChange={(e) => setAmount(Number(e.target.value))}
                                            className="w-full px-4 py-2.5 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:bg-gray-700 dark:text-white bg-white"
                                            placeholder="0.00"
                                            required
                                        />
                                    </div>
                                )
                            )}

                            <div className="mt-6">
                                {expenseName === "" ? (
                                    <p className="font-semibold text-center text-gray-500">Select an expense to submit.</p>
                                ) : (
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="w-full inline-flex justify-center items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 text-white font-semibold rounded-lg shadow-lg transform hover:scale-[1.02] transition-all duration-200"
                                    >
                                        {isSubmitting ? "Submitting..." : "Submit Expense"}
                                    </button>
                                )}
                            </div>

                        </div>
                    </form>
                </div>
            </div>
        </main>
    );
}