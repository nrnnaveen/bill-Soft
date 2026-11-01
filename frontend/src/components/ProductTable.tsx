import React from 'react';
import { Product } from '../services/api';
import { PlusCircle, Edit3, Trash2, History, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface ProductTableProps {
  products: Product[];
  isLoading: boolean;
  onEdit: (product: Product) => void;
  onRestock: (product: Product) => void;
  onDelete: (product: Product) => void;
  onViewMovements: (product: Product) => void;
}

export const ProductTable: React.FC<ProductTableProps> = ({
  products,
  isLoading,
  onEdit,
  onRestock,
  onDelete,
  onViewMovements,
}) => {
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="font-medium text-sm">Loading inventory products...</p>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-500">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-slate-700">No products found</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
          Start by adding your first product to manage your shop's inventory and generate bills.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <th className="py-3.5 px-4">Code</th>
              <th className="py-3.5 px-4">Product Name</th>
              <th className="py-3.5 px-4">Unit</th>
              <th className="py-3.5 px-4 text-right">Selling Price (₹)</th>
              <th className="py-3.5 px-4 text-right">GST Rate</th>
              <th className="py-3.5 px-4 text-right">Available Stock</th>
              <th className="py-3.5 px-4 text-center">Status</th>
              <th className="py-3.5 px-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {products.map((p) => {
              const isOutOfStock = p.stock_quantity <= 0;
              const isLowStock = p.stock_quantity > 0 && p.stock_quantity <= 5;

              return (
                <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-semibold text-xs text-indigo-700">
                    {p.code}
                  </td>
                  <td className="py-3.5 px-4 font-medium text-slate-900">
                    {p.name}
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">
                    <span className="inline-block px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">
                      {p.unit}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-semibold text-slate-800">
                    ₹{p.selling_price.toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 text-right text-slate-700">
                    {p.gst_rate}%
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                    {p.stock_quantity.toLocaleString()} {p.unit}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    {isOutOfStock ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">
                        <XCircle className="w-3.5 h-3.5" /> Out of Stock
                      </span>
                    ) : isLowStock ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                        <AlertTriangle className="w-3.5 h-3.5" /> Low Stock
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                        <CheckCircle className="w-3.5 h-3.5" /> In Stock
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onRestock(p)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                        title="Add incoming stock"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Add Stock</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit(p)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                        title="Edit product details"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onViewMovements(p)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                        title="View stock history"
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(p)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Deactivate product"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
