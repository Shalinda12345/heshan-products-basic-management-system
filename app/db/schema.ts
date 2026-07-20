import { mysqlTable, serial, varchar, timestamp, double, int, date } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    createdAt: timestamp('createdAt').defaultNow(),
});

export const products = mysqlTable('products', {
    product_id: serial('product_id').primaryKey(),
    product_name: varchar('product_name', { length: 255 }).notNull(),
    description: varchar('description', { length: 255 }).notNull(),
})

export const customers = mysqlTable('customers', {
    customer_id: serial('customer_id').primaryKey(),
    customer_name: varchar('customer_name', { length: 255 }).notNull(),
})


export const sales = mysqlTable('sales', {
    sale_id: serial('sale_id').primaryKey(),
    customer_name: varchar('customer_name', { length: 255 }).notNull(),
    grand_total: double('grand_total', { precision: 10, scale: 2 }).notNull(),
    sale_date: date('sale_date').notNull(),
})


export const sale_items = mysqlTable('sale_items', {
    sale_detail_id: serial('sale_detail_id').notNull().primaryKey(),
    sale_id: int('sale_id').notNull(),
    product_name: varchar('product_name', { length: 255 }).notNull(),
    quantity: double('quantity', { precision: 10, scale: 2 }).notNull(),
    selling_price: double('selling_price', { precision: 10, scale: 2 }).notNull(),
    total: double('total', { precision: 10, scale: 2 }).notNull(),
});


export const expenses_list = mysqlTable('expenses_list', {
    expense_id: serial('expense_id').notNull().primaryKey(),
    expense_name: varchar('expense_name', { length: 255 }).notNull(),
})


export const expenses = mysqlTable('expenses', {
    expense_item_id: serial('expense_item_id').notNull().primaryKey(),
    expense_name: varchar('expense_name', { length: 255 }).notNull(),
    quantity: double('quantity', { precision: 10, scale: 2 }),
    per_expense_amount: double('per_expense_amount', { precision: 10, scale: 2 }).notNull(),
    total: double('total', { precision: 10, scale: 2 }).notNull(),
    expense_date: date('expense_date').notNull(),
});

export const stocks = mysqlTable('stocks', {
    stock_id: serial('stock_id').primaryKey(),
    product_id: int('product_id').notNull().unique(),
    quantity: double('quantity', { precision: 10, scale: 2 }).notNull().default(0),
    updated_at: timestamp('updated_at').defaultNow().onUpdateNow(),
});


export const employees = mysqlTable('employees', {
    employee_id: serial('employee_id').primaryKey(),
    employee_name: varchar('employee_name', { length: 255 }).notNull(),
    employee_address: varchar('employee_address', { length: 255 }).notNull(),
    employee_contact_no: varchar('employee_contact_no', { length: 255 }).notNull(),
    maritial_status: varchar('maritial_status', { length: 255 }).notNull(),
})

// Tracks all return transactions regardless of type
export const returns = mysqlTable('returns', {
    return_id:       serial('return_id').primaryKey(),
    // One of: stock_expense_return | stock_replacement_return | sale_reduction_return | sale_reduction_expense_return
    return_type:     varchar('return_type', { length: 100 }).notNull(),
    product_name:    varchar('product_name', { length: 255 }).notNull(),
    quantity:        double('quantity', { precision: 10, scale: 2 }).notNull(),
    per_unit_amount: double('per_unit_amount', { precision: 10, scale: 2 }).notNull(),
    total:           double('total', { precision: 10, scale: 2 }).notNull(),
    // Set when stock is credited back (stock_expense_return, stock_replacement_return, sale_reduction_return)
    stock_id:        int('stock_id'),
    // Set for sale-reduction return types
    sale_id:         int('sale_id'),
    // Set when an expense entry is created (stock_expense_return, sale_reduction_expense_return)
    expense_item_id: int('expense_item_id'),
    return_date:     date('return_date').notNull(),
    created_at:      timestamp('created_at').defaultNow(),
})