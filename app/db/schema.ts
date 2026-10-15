import { mysqlTable, serial, varchar, timestamp, double, int, date, index, uniqueIndex, boolean, text } from 'drizzle-orm/mysql-core';

// The database is created and upgraded by app/db/migrations.ts; keep the two in step.

// People who can sign in. `role` is one of ROLES in app/lib/permissions.ts.
export const users = mysqlTable('users', {
    id: serial('id').primaryKey(),
    username: varchar('username', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    password_hash: varchar('password_hash', { length: 255 }),
    role: varchar('role', { length: 20 }).notNull().default('staff'),
    is_active: boolean('is_active').notNull().default(true),
    must_change_password: boolean('must_change_password').notNull().default(false),
    // Bumped to sign the user out everywhere (password change, deactivation, role change)
    session_version: int('session_version').notNull().default(1),
    failed_login_attempts: int('failed_login_attempts').notNull().default(0),
    locked_until: timestamp('locked_until'),
    last_login_at: timestamp('last_login_at'),
    createdAt: timestamp('createdAt').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow().onUpdateNow(),
}, (table) => [
    uniqueIndex('users_username_unique').on(table.username),
]);

export const products = mysqlTable('products', {
    product_id: serial('product_id').primaryKey(),
    product_name: varchar('product_name', { length: 255 }).notNull(),
    description: varchar('description', { length: 255 }).notNull(),
    // Default selling price, filled in on new invoices
    unit_price: double('unit_price', { precision: 10, scale: 2 }),
    // What one unit costs to make or buy: used for estimated margins and stock value
    unit_cost: double('unit_cost', { precision: 10, scale: 2 }),
    // Low-stock alert level; null means LOW_STOCK_THRESHOLD in app/lib/stock.ts
    reorder_level: double('reorder_level', { precision: 10, scale: 2 }),
    is_active: boolean('is_active').notNull().default(true),
    created_at: timestamp('created_at').defaultNow(),
})

export const customers = mysqlTable('customers', {
    customer_id: serial('customer_id').primaryKey(),
    customer_name: varchar('customer_name', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 50 }),
    address: varchar('address', { length: 255 }),
    is_active: boolean('is_active').notNull().default(true),
    created_at: timestamp('created_at').defaultNow(),
})


export const sales = mysqlTable('sales', {
    sale_id: serial('sale_id').primaryKey(),
    customer_id: int('customer_id'),
    // Customer's name when the invoice was posted
    customer_name: varchar('customer_name', { length: 255 }).notNull(),
    grand_total: double('grand_total', { precision: 10, scale: 2 }).notNull(),
    sale_date: date('sale_date').notNull(),
    // posted | void (voided invoices are kept for the record but left out of every total)
    status: varchar('status', { length: 10 }).notNull().default('posted'),
    void_reason: varchar('void_reason', { length: 255 }),
    voided_at: timestamp('voided_at'),
    voided_by: int('voided_by'),
    created_by: int('created_by'),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => [
    index('sales_date_idx').on(table.sale_date),
])


export const sale_items = mysqlTable('sale_items', {
    sale_detail_id: serial('sale_detail_id').notNull().primaryKey(),
    sale_id: int('sale_id').notNull(),
    product_id: int('product_id'),
    // Product's name when the invoice was posted
    product_name: varchar('product_name', { length: 255 }).notNull(),
    quantity: double('quantity', { precision: 10, scale: 2 }).notNull(),
    selling_price: double('selling_price', { precision: 10, scale: 2 }).notNull(),
    total: double('total', { precision: 10, scale: 2 }).notNull(),
}, (table) => [
    index('sale_items_sale_idx').on(table.sale_id),
]);


export const expenses_list = mysqlTable('expenses_list', {
    expense_id: serial('expense_id').notNull().primaryKey(),
    expense_name: varchar('expense_name', { length: 255 }).notNull(),
    // How the category is entered: one of the keys of EXPENSE_KINDS in app/lib/expense-kinds.ts
    kind: varchar('kind', { length: 20 }).notNull().default('standard'),
    is_active: boolean('is_active').notNull().default(true),
})


export const expenses = mysqlTable('expenses', {
    expense_item_id: serial('expense_item_id').notNull().primaryKey(),
    expense_name: varchar('expense_name', { length: 255 }).notNull(),
    // Employee paid, for entries in a salary-kind category (Salary, Salary Advance...)
    employee_name: varchar('employee_name', { length: 255 }),
    quantity: double('quantity', { precision: 10, scale: 2 }),
    per_expense_amount: double('per_expense_amount', { precision: 10, scale: 2 }).notNull(),
    total: double('total', { precision: 10, scale: 2 }).notNull(),
    expense_date: date('expense_date').notNull(),
    // posted | void (voided expenses are kept for the record but left out of every total)
    status: varchar('status', { length: 10 }).notNull().default('posted'),
    void_reason: varchar('void_reason', { length: 255 }),
    voided_at: timestamp('voided_at'),
    voided_by: int('voided_by'),
    created_by: int('created_by'),
    created_at: timestamp('created_at').defaultNow(),
}, (table) => [
    index('expenses_date_idx').on(table.expense_date),
]);

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
    is_active: boolean('is_active').notNull().default(true),
    created_at: timestamp('created_at').defaultNow(),
})

// Stock ledger: one row per change to a product's stock level, so every unit in and out is traceable.
// `quantity` is always positive; `direction` says which way it moved.
export const stock_movements = mysqlTable('stock_movements', {
    movement_id:   serial('movement_id').primaryKey(),
    product_id:    int('product_id').notNull(),
    product_name:  varchar('product_name', { length: 255 }).notNull(),
    // IN | OUT
    direction:     varchar('direction', { length: 3 }).notNull(),
    // One of the keys of MOVEMENT_TYPES in app/lib/stock.ts
    movement_type: varchar('movement_type', { length: 50 }).notNull(),
    quantity:      double('quantity', { precision: 10, scale: 2 }).notNull(),
    // Stock level of the product right after this movement
    balance_after: double('balance_after', { precision: 10, scale: 2 }).notNull(),
    // Source document, e.g. "Sale #12"
    reference:     varchar('reference', { length: 100 }),
    note:          varchar('note', { length: 255 }),
    // Business date the movement belongs to (e.g. the invoice date)
    movement_date: date('movement_date').notNull(),
    created_by:    int('created_by'),
    created_at:    timestamp('created_at').defaultNow(),
}, (table) => [
    index('stock_movements_product_idx').on(table.product_id),
    index('stock_movements_date_idx').on(table.movement_date),
])

// Tracks all return transactions regardless of type
export const returns = mysqlTable('returns', {
    return_id:       serial('return_id').primaryKey(),
    // One of: stock_expense_return | sale_reduction_return | sale_reduction_expense_return
    return_type:     varchar('return_type', { length: 100 }).notNull(),
    product_name:    varchar('product_name', { length: 255 }).notNull(),
    quantity:        double('quantity', { precision: 10, scale: 2 }).notNull(),
    per_unit_amount: double('per_unit_amount', { precision: 10, scale: 2 }).notNull(),
    total:           double('total', { precision: 10, scale: 2 }).notNull(),
    // Set when stock is credited back (stock_expense_return, sale_reduction_return)
    stock_id:        int('stock_id'),
    // Set for sale-reduction return types
    sale_id:         int('sale_id'),
    // Set when an expense entry is created (stock_expense_return, sale_reduction_expense_return)
    expense_item_id: int('expense_item_id'),
    return_date:     date('return_date').notNull(),
    // posted | void
    status:          varchar('status', { length: 10 }).notNull().default('posted'),
    void_reason:     varchar('void_reason', { length: 255 }),
    voided_at:       timestamp('voided_at'),
    voided_by:       int('voided_by'),
    created_by:      int('created_by'),
    created_at:      timestamp('created_at').defaultNow(),
})

// Append-only record of who did what, written in the same transaction as the change it describes
export const activity_log = mysqlTable('activity_log', {
    activity_id: serial('activity_id').primaryKey(),
    occurred_at: timestamp('occurred_at').notNull().defaultNow(),
    // Who did it (null for failed sign-ins of unknown usernames)
    user_id:     int('user_id'),
    username:    varchar('username', { length: 50 }),
    // One of the keys of ACTIVITY_ACTIONS in app/lib/activity.ts
    action:      varchar('action', { length: 50 }).notNull(),
    entity_type: varchar('entity_type', { length: 30 }),
    entity_id:   varchar('entity_id', { length: 50 }),
    // One readable sentence, e.g. "Recorded sale #12 for Kamal Stores (Rs. 1,900.00)"
    summary:     varchar('summary', { length: 500 }).notNull(),
    // JSON: the values involved, and for edits the before/after of each changed field
    details:     text('details'),
    ip_address:  varchar('ip_address', { length: 64 }),
    user_agent:  varchar('user_agent', { length: 255 }),
}, (table) => [
    index('activity_log_time_idx').on(table.occurred_at),
    index('activity_log_user_idx').on(table.user_id),
    index('activity_log_entity_idx').on(table.entity_type, table.entity_id),
])
