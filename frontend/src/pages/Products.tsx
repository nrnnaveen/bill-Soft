import React, { useState, useEffect } from 'react';
import { api, Product, ProductCreate, ProductUpdate, StockMovement } from '../services/api';
import { offlineStorage } from '../offline/storage';
import { ProductTable } from '../components/ProductTable';
import { 
  Package, 
  Plus, 
  Search, 
  X, 
  Check, 
  AlertCircle, 
  ArrowUpRight, 
  History,
  Boxes
} from 'lucide-react';

export const Products: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [restockingProduct, setRestockingProduct] = useState<Product | null>(null);
  const [viewingMovementsProduct, setViewingMovementsProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [isMovementsLoading, setIsMovementsLoading] = useState(false);

  // Form states
  const [formData, setFormData] = useState<ProductCreate>({
    code: '',
    name: '',
    unit: 'Nos',
    selling_price: 0,
    gst_rate: 18,
    stock_quantity: 0,
  });

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [restockQty, setRestockQty] = useState<number>(10);
  const [restockNotes, setRestockNotes] = useState<string>('New stock');
  const [isSaving, setIsSaving] = useState(false);

  const fetchProducts = async (showLoading = false) => {
    try {
      if (showLoading) setIsLoading(true);
      setError(null);
      const data = await api.getProducts();
      if (Array.isArray(data) && data.length > 0) {
        setAllProducts(data);
        await offlineStorage.setProducts(data);
      } else {
        const local = await offlineStorage.getProducts();
        setAllProducts(Array.isArray(local) ? local : []);
      }
    } catch (err: any) {
      console.warn('Network error loading products, using offline store', err);
      const local = await offlineStorage.getProducts();
      setAllProducts(Array.isArray(local) ? local : []);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial instant hydration from local Dexie store + background server refresh
  useEffect(() => {
    offlineStorage.getProducts().then(local => {
      const safeLocal = Array.isArray(local) ? local : [];
      if (safeLocal.length > 0) {
        setAllProducts(safeLocal);
        setProducts(safeLocal);
        setIsLoading(false);
      }
      fetchProducts(safeLocal.length === 0);
    });
  }, []);

  // Instant client-side search filtering without network jitter or catalog wiping
  useEffect(() => {
    const list = Array.isArray(allProducts) ? allProducts : [];
    const q = search.trim().toLowerCase();
    if (!q) {
      setProducts(list);
    } else {
      setProducts(
        list.filter(
          p => (p.name || '').toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q)
        )
      );
    }
  }, [search, allProducts]);

  // Open Add Modal
  const handleOpenAdd = () => {
    setFormData({
      code: '',
      name: '',
      unit: 'Nos',
      selling_price: 0,
      gst_rate: 0,
      stock_quantity: 0,
    });
    setError(null);
    setIsAddModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setFormData({
      code: p.code,
      name: p.name,
      unit: p.unit,
      selling_price: p.selling_price,
      gst_rate: p.gst_rate,
      stock_quantity: p.stock_quantity,
    });
    setError(null);
  };

  // Open Restock Modal
  const handleOpenRestock = (p: Product) => {
    setRestockingProduct(p);
    setRestockQty(10);
    setRestockNotes('New stock');
    setError(null);
  };

  // Open Movements Modal
  const handleOpenMovements = async (p: Product) => {
    setViewingMovementsProduct(p);
    try {
      setIsMovementsLoading(true);
      const data = await api.getProductMovements(p.id);
      setMovements(data);
    } catch (err) {
      console.error('Failed to load stock movements', err);
    } finally {
      setIsMovementsLoading(false);
    }
  };

  // Save new product
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) {
      setError('Product code and name are required.');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      await api.createProduct(formData);
      setIsAddModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to create product.');
    } finally {
      setIsSaving(false);
    }
  };

  // Save edit
  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    try {
      setIsSaving(true);
      setError(null);
      await api.updateProduct(editingProduct.id, formData);
      setEditingProduct(null);
      fetchProducts();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to update product.');
    } finally {
      setIsSaving(false);
    }
  };

  // Submit restock
  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockingProduct || restockQty <= 0) return;

    try {
      setIsSaving(true);
      setError(null);
      await api.restockProduct(restockingProduct.id, restockQty, restockNotes);
      setRestockingProduct(null);
      fetchProducts();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to restock product.');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete / deactivate product
  const handleDeleteProduct = async (p: Product) => {
    if (!confirm(`Are you sure you want to deactivate '${p.name}' (${p.code})? It can be reactivated anytime.`)) {
      return;
    }
    try {
      await api.deleteProduct(p.id);
      fetchProducts();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to deactivate product.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-amber-600" /> Products
          </h2>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-200 transition-all active:scale-95 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products by name or code..."
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white"
          />
        </div>
      </div>

      {/* Main Table */}
      <ProductTable
        products={products}
        isLoading={isLoading}
        onEdit={handleOpenEdit}
        onRestock={handleOpenRestock}
        onDelete={handleDeleteProduct}
        onViewMovements={handleOpenMovements}
      />

      {/* ADD PRODUCT MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-lg text-slate-900">Add New Product</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateProduct} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Product Code / SKU *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                    placeholder="e.g. ELEC-001"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Unit *
                  </label>
                  <select
                    value={formData.unit}
                    onChange={e => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                  >
                    <option value="Nos">Nos</option>
                    <option value="Pcs">Pcs</option>
                    <option value="Kg">Kg</option>
                    <option value="Box">Box</option>
                    <option value="Mtr">Mtr</option>
                    <option value="Set">Set</option>
                    <option value="Liter">Liter</option>
                    <option value="Packet">Packet</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product Name / Description *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. LED Tube Light 20W"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Selling Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.selling_price === 0 ? '' : formData.selling_price}
                    placeholder="0.00"
                    onFocus={(e) => e.target.select()}
                    onChange={e => {
                      const v = e.target.value;
                      setFormData({ ...formData, selling_price: v === '' ? 0 : parseFloat(v) || 0 });
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    GST Rate (Optional)
                  </label>
                  <select
                    value={formData.gst_rate}
                    onChange={e => setFormData({ ...formData, gst_rate: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white font-medium"
                  >
                    <option value={0}>0% - Exempt / None</option>
                    <option value={5}>5%</option>
                    <option value={12}>12%</option>
                    <option value={18}>18%</option>
                    <option value={28}>28%</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Initial Stock *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.stock_quantity === 0 ? '' : formData.stock_quantity}
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                    onChange={e => {
                      const v = e.target.value;
                      setFormData({ ...formData, stock_quantity: v === '' ? 0 : parseInt(v, 10) || 0 });
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 active:scale-95"
                >
                  {isSaving ? 'Saving...' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PRODUCT MODAL */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-lg text-slate-900">Edit Product: {editingProduct.code}</h3>
              <button
                onClick={() => setEditingProduct(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleUpdateProduct} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Product Code
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={formData.unit}
                    onChange={e => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Selling Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.selling_price === 0 ? '' : formData.selling_price}
                    placeholder="0.00"
                    onFocus={(e) => e.target.select()}
                    onChange={e => {
                      const v = e.target.value;
                      setFormData({ ...formData, selling_price: v === '' ? 0 : parseFloat(v) || 0 });
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    GST Rate (Optional)
                  </label>
                  <select
                    value={formData.gst_rate}
                    onChange={e => setFormData({ ...formData, gst_rate: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white font-medium"
                  >
                    <option value={0}>0% - Exempt / None</option>
                    <option value={5}>5%</option>
                    <option value={12}>12%</option>
                    <option value={18}>18%</option>
                    <option value={28}>28%</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Current Stock
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.stock_quantity === 0 ? '' : formData.stock_quantity}
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                    onChange={e => {
                      const v = e.target.value;
                      setFormData({ ...formData, stock_quantity: v === '' ? 0 : parseInt(v, 10) || 0 });
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 active:scale-95"
                >
                  {isSaving ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESTOCK PRODUCT MODAL */}
      {restockingProduct && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <Boxes className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Add Stock</h3>
                  <p className="text-xs text-slate-500">{restockingProduct.name} ({restockingProduct.code})</p>
                </div>
              </div>
              <button
                onClick={() => setRestockingProduct(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleRestockSubmit} className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-600">Current Stock:</span>
                <span className="font-bold font-mono text-slate-900">
                  {Math.max(0, restockingProduct.stock_quantity)} {restockingProduct.unit}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quantity to Add *
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={restockQty === 0 ? '' : restockQty}
                  placeholder="0"
                  onFocus={(e) => e.target.select()}
                  onChange={e => {
                    const v = e.target.value;
                    setRestockQty(v === '' ? 0 : parseFloat(v) || 0);
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />

                {/* Quick Add Presets */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[11px] text-slate-500 font-medium mr-1">Quick Add:</span>
                  {[1, 5, 10, 25, 50, 100].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setRestockQty(prev => (Number(prev) || 0) + amt)}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 transition-colors"
                    >
                      +{amt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={restockNotes}
                  onChange={e => setRestockNotes(e.target.value)}
                  placeholder="e.g. New delivery, Supplier invoice"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-between text-xs font-semibold text-emerald-800">
                <span>New Total Balance:</span>
                <span className="font-bold font-mono">
                  {(Math.max(0, restockingProduct.stock_quantity) + (Number(restockQty) || 0)).toFixed(2)} {restockingProduct.unit}
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRestockingProduct(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || restockQty <= 0}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-200 active:scale-95"
                >
                  {isSaving ? 'Adding Stock...' : 'Add Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STOCK MOVEMENTS LOG MODAL */}
      {viewingMovementsProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Stock History</h3>
                  <p className="text-xs text-slate-500">
                    {viewingMovementsProduct.name} ({viewingMovementsProduct.code})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingMovementsProduct(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isMovementsLoading ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading movements...</div>
              ) : movements.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">No stock history recorded yet.</div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase">
                      <th className="py-2.5 px-3">Date &amp; Time</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 text-right">Change</th>
                      <th className="py-2.5 px-3 text-right">Balance After</th>
                      <th className="py-2.5 px-3">Notes / Ref</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {movements.map(m => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                          {new Date(m.created_at).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              m.movement_type === 'SALE'
                                ? 'bg-rose-100 text-rose-700'
                                : m.movement_type === 'RESTOCK'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {m.movement_type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">
                          <span className={m.quantity < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                            {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                          {m.balance_after}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {m.notes || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 text-right">
              <button
                onClick={() => setViewingMovementsProduct(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
