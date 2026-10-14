'use client';

import { useMemo, useState } from 'react';
import ManageNavigation from '@/app/components/admin/manage-navigation';
import { PageHeader, PageShell, Card, LoadingRows, TableMessage, tableClasses as t } from '@/app/components/ui/page-shell';
import { Button, Field, Toggle, filterClass, inputClass } from '@/app/components/ui/form';
import { ActiveBadge, Badge, Notice } from '@/app/components/ui/feedback';
import Modal from '@/app/components/ui/modal';
import { apiSend, errorMessage } from '@/app/lib/api-client';
import { useResource } from '@/app/lib/use-resource';
import { formatAmount, formatMoney, formatQty } from '@/app/lib/format';
import { LOW_STOCK_THRESHOLD, stockStatus } from '@/app/lib/stock';

interface Product {
    product_id: number;
    product_name: string;
    description: string;
    unit_price: number | null;
    unit_cost: number | null;
    reorder_level: number | null;
    is_active: boolean;
}

interface StockRow {
    product_id: number;
    quantity: number;
}

interface FormState {
    product_name: string;
    description: string;
    unit_price: string;
    unit_cost: string;
    reorder_level: string;
    opening_stock: string;
}

const EMPTY: FormState = { product_name: '', description: '', unit_price: '', unit_cost: '', reorder_level: '', opening_stock: '' };
const text = (value: number | null) => (value === null ? '' : String(value));

export default function ProductsAdminPage() {
    const products = useResource<Product[]>('/api/products?include_inactive=1');
    const stock = useResource<StockRow[]>('/api/stock');
    const [search, setSearch] = useState('');
    const [showInactive, setShowInactive] = useState(false);
    const [editing, setEditing] = useState<Product | 'new' | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

    const onHand = useMemo(() => new Map((stock.data ?? []).map((s) => [s.product_id, s.quantity])), [stock.data]);
    const rows = (products.data ?? [])
        .filter((p) => showInactive || p.is_active)
        .filter((p) => `${p.product_name} ${p.description}`.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.product_name.localeCompare(b.product_name));

    const openNew = () => {
        setForm(EMPTY);
        setFormError(null);
        setEditing('new');
    };
    const openEdit = (product: Product) => {
        setForm({
            product_name: product.product_name,
            description: product.description,
            unit_price: text(product.unit_price),
            unit_cost: text(product.unit_cost),
            reorder_level: text(product.reorder_level),
            opening_stock: '',
        });
        setFormError(null);
        setEditing(product);
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setFormError(null);
        const body = {
            product_name: form.product_name,
            description: form.description,
            unit_price: form.unit_price,
            unit_cost: form.unit_cost,
            reorder_level: form.reorder_level,
            ...(editing === 'new' ? { opening_stock: form.opening_stock } : {}),
        };
        try {
            if (editing === 'new') {
                await apiSend('/api/products', 'POST', body);
                setNotice({ tone: 'success', text: `Added "${form.product_name.trim()}".` });
            } else if (editing) {
                await apiSend(`/api/products/${editing.product_id}`, 'PATCH', body);
                setNotice({ tone: 'success', text: `Saved "${form.product_name.trim()}".` });
            }
            setEditing(null);
            products.reload();
            stock.reload();
        } catch (error) {
            setFormError(errorMessage(error));
        } finally {
            setSaving(false);
        }
    };

    const setActive = async (product: Product, active: boolean) => {
        try {
            await apiSend(`/api/products/${product.product_id}`, 'PATCH', { is_active: active });
            setNotice({ tone: 'success', text: `"${product.product_name}" is now ${active ? 'active' : 'inactive'}.` });
            products.reload();
        } catch (error) {
            setNotice({ tone: 'error', text: errorMessage(error) });
        }
    };

    const margin = (p: Product) =>
        p.unit_price && p.unit_cost !== null ? Math.round(((p.unit_price - p.unit_cost) / p.unit_price) * 1000) / 10 : null;

    return (
        <PageShell nav={<ManageNavigation />}>
            <PageHeader
                title="Products"
                description="What you sell: default selling prices for new invoices, unit costs for margin estimates and stock value, and the stock level at which a product counts as low."
                actions={<Button onClick={openNew}>+ Add product</Button>}
            />

            {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
            {products.error && <Notice tone="error" title="Could not load products">{products.error}</Notice>}

            <Card>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
                    <input
                        type="search"
                        placeholder="Search products…"
                        aria-label="Search products"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={`${filterClass} sm:w-72`}
                    />
                    <Toggle checked={showInactive} onChange={setShowInactive} label="Show inactive" />
                </div>

                <div className={t.wrapper}>
                    <table className={t.table} aria-label="Products">
                        <thead>
                            <tr className={t.head}>
                                <th className={t.th}>Product</th>
                                <th className={`${t.th} text-right`}>Selling price</th>
                                <th className={`${t.th} text-right`}>Unit cost</th>
                                <th className={`${t.th} text-right`}>Margin</th>
                                <th className={`${t.th} text-right`}>Reorder at</th>
                                <th className={`${t.th} text-right`}>In stock</th>
                                <th className={t.th}>Status</th>
                                <th className={`${t.th} text-right`}>Actions</th>
                            </tr>
                        </thead>
                        <tbody className={`${t.body} ${products.loading && products.data ? 'opacity-60' : ''}`}>
                            {!products.data && products.loading ? (
                                <LoadingRows colSpan={8} />
                            ) : rows.length === 0 ? (
                                <TableMessage colSpan={8} title="No products" hint={search ? 'Nothing matches the search.' : 'Add your first product to start invoicing.'} />
                            ) : rows.map((p) => {
                                const qty = onHand.get(p.product_id) ?? 0;
                                const status = stockStatus(qty, p.reorder_level);
                                const m = margin(p);
                                return (
                                    <tr key={p.product_id} className={`${t.row} ${p.is_active ? '' : 'opacity-60'}`}>
                                        <td className={t.td}>
                                            <p className="font-semibold text-white">{p.product_name}</p>
                                            {p.description && <p className="text-xs text-slate-500">{p.description}</p>}
                                        </td>
                                        <td className={t.num}>{p.unit_price === null ? <span className="text-slate-600">—</span> : formatAmount(p.unit_price)}</td>
                                        <td className={t.num}>{p.unit_cost === null ? <span className="text-amber-400/80" title="Add a unit cost to see margins and stock value">not set</span> : formatAmount(p.unit_cost)}</td>
                                        <td className={t.num}>{m === null ? <span className="text-slate-600">—</span> : <span className={m < 0 ? 'text-rose-400' : 'text-slate-200'}>{m.toFixed(1)}%</span>}</td>
                                        <td className={t.num}>{p.reorder_level === null ? <span className="text-slate-500" title="Default level">{LOW_STOCK_THRESHOLD}*</span> : formatQty(p.reorder_level)}</td>
                                        <td className={t.num}>
                                            <span className={status === 'out' ? 'text-rose-400 font-bold' : status === 'low' ? 'text-amber-400 font-bold' : 'text-slate-200'}>{formatQty(qty)}</span>
                                        </td>
                                        <td className={t.td}>
                                            <div className="flex flex-wrap gap-1.5">
                                                <ActiveBadge active={p.is_active} />
                                                {p.is_active && status !== 'ok' && <Badge tone={status === 'out' ? 'red' : 'amber'}>{status === 'out' ? '⚠ Out' : '⚠ Low'}</Badge>}
                                            </div>
                                        </td>
                                        <td className={`${t.td} text-right whitespace-nowrap`}>
                                            <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>Edit</Button>
                                            <Button variant="ghost" size="sm" onClick={() => setActive(p, !p.is_active)}>{p.is_active ? 'Deactivate' : 'Activate'}</Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                    * Products without their own reorder level count as low below {LOW_STOCK_THRESHOLD} units. Inactive products can&apos;t be sold but keep their history.
                </p>
            </Card>

            <Modal
                open={editing !== null}
                title={editing === 'new' ? 'Add product' : `Edit ${editing?.product_name ?? ''}`}
                description={editing === 'new' ? 'The product becomes available on new invoices straight away.' : 'Past invoices keep the name they were posted with; reports follow the product.'}
                onClose={() => setEditing(null)}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                        <Button type="submit" form="product-form" busy={saving}>{editing === 'new' ? 'Add product' : 'Save changes'}</Button>
                    </>
                }
            >
                <form id="product-form" onSubmit={save} className="space-y-4">
                    {formError && <Notice tone="error">{formError}</Notice>}
                    <Field label="Product name">
                        {(id) => <input id={id} className={inputClass} value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} required maxLength={255} />}
                    </Field>
                    <Field label="Description" hint="Optional, e.g. size or flavour">
                        {(id) => <input id={id} className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={255} />}
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Selling price (Rs.)" hint="Filled in on new invoices">
                            {(id) => <input id={id} type="number" min="0" step="0.01" className={inputClass} value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />}
                        </Field>
                        <Field label="Unit cost (Rs.)" hint="To make or buy one unit">
                            {(id) => <input id={id} type="number" min="0" step="0.01" className={inputClass} value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />}
                        </Field>
                        <Field label="Reorder level" hint={`Low-stock alert at or below this (default below ${LOW_STOCK_THRESHOLD})`}>
                            {(id) => <input id={id} type="number" min="0" step="any" className={inputClass} value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} />}
                        </Field>
                        {editing === 'new' && (
                            <Field label="Opening stock" hint="Units on hand now (recorded in the stock ledger)">
                                {(id) => <input id={id} type="number" min="0" step="any" className={inputClass} value={form.opening_stock} onChange={(e) => setForm({ ...form, opening_stock: e.target.value })} />}
                            </Field>
                        )}
                    </div>
                    {form.unit_price && form.unit_cost && Number(form.unit_price) > 0 && (
                        <p className="text-xs text-slate-400">
                            Margin per unit: <strong className="text-slate-200">{formatMoney(Number(form.unit_price) - Number(form.unit_cost))}</strong>
                            {' '}({(((Number(form.unit_price) - Number(form.unit_cost)) / Number(form.unit_price)) * 100).toFixed(1)}%)
                        </p>
                    )}
                </form>
            </Modal>
        </PageShell>
    );
}
