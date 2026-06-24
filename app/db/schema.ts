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
    customer_name: varchar('customer_name', { length: 255}).notNull(),
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
    expense_name: varchar('expense_name', {length:255}).notNull(),
})


export const expenses = mysqlTable('expenses', {
    expense_item_id: serial('expense_item_id').notNull().primaryKey(),
    expense_name: varchar('expense_name', {length:255}).notNull(),
    quantity: double('quantity', { precision: 10, scale: 2 }),
    per_expense_amount: double('per_expense_amount', { precision: 10, scale: 2 }).notNull(),
    total: double('total', { precision: 10, scale: 2 }).notNull(),
    expense_date: date('expense_date').notNull(),
})