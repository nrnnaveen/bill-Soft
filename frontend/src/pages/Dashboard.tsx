import React, { useEffect, useState } from 'react';
import { api, DashboardStats, Invoice, ShopSettings } from '../services/api';
import { offlineStorage } from '../offline/storage';
import { PageId } from '../components/Sidebar';
import { 
  Package, 
  Boxes, 
  IndianRupee, 
  Receipt, 
  AlertTriangle, 
  Plus, 
  ArrowRight, 
  Printer, 
  RefreshCw,
  ShoppingBag
} from 'lucide-react';

interface DashboardProps {
  onNavigate: (page: PageId) => void;
  onOpenInvoice: (invoice: Invoice) => void;
  settings: ShopSettings;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onOpenInvoice }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const computeLocalStats = async () => {
    try {
      const localProds = await offlineStorage.getProducts();
      const localInvs = await offlineStorage.getInvoices();
      const todayStr = new Date().toISOString().split('T')[0];
      const todayInvs = (localInvs || []).filter(i => (i.invoice_date || '').startsWith(todayStr));
      const todaySales = todayInvs.reduce((sum, i) => sum + (i.total_amount || 0), 0);
      const lowStock = (localProds || []).filter(p => p.stock_quantity <= 5);

      setStats({
        total_products: (localProds || []).length,
        total_stock_units: (localProds || []).reduce((sum, p) => sum + (p.stock_quantity || 0), 0),
        today_sales: Math.round(todaySales * 100) / 100,
        today_bills_count: todayInvs.length,
        low_stock_products_count: lowStock.length,
        low_stock_products: lowStock.map(p => ({
          id: p.id,
          code: p.code,
          name: p.name,
          stock_quantity: p.stock_quantity,
          unit: p.unit,
          selling_price: p.selling_price,
        })),
        recent_invoices: (localInvs || []).slice(0, 5).map(inv => ({
          id: typeof inv.id === 'number' ? inv.id : 0,
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          customer_name: inv.customer_name,
          total_amount: inv.total_amount,
          payment_mode: inv.payment_mode,
          is_gst_bill: inv.is_gst_bill,
        })),
      });
      setIsLoading(false);
    } catch (e) {
      console.warn('Error computing local stats:', e);
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      setError(null);
      const data = await api.getDashboardStats();
      if (data && typeof data === 'object' && 'total_products' in data) {
        setStats(data);
      } else {
        await computeLocalStats();
      }
    } catch (err: any) {
      console.warn('Network error loading dashboard metrics, computing from local offline DB', err);
      await computeLocalStats();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    computeLocalStats().then(() => {
      fetchStats();
    });
  }, []);


  const handlePrintRecent = async (invId: number) => {
    try {
      const fullInvoice = await api.getInvoice(invId);
      onOpenInvoice(fullInvoice);
    } catch (err) {
      const local = await offlineStorage.getInvoiceById(invId);
      if (local) {
        onOpenInvoice(local);
      } else {
        alert('Failed to load invoice for printing.');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Dashboard
          </h2>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchStats}
            title="Refresh Metrics"
            aria-label="Refresh dashboard metrics"
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 shadow-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => onNavigate('billing')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-200 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> Create Bill
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchStats} className="underline text-xs font-semibold">Retry</button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Products */}
        <div className="p-5 rounded-2xl bg-indigo-600 text-white shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-indigo-100 uppercase tracking-wider">
              Total Products
            </p>
            <h3 className="text-3xl font-extrabold mt-1">
              {isLoading ? '...' : (stats?.total_products || 0)}
            </h3>
          </div>
          <div className="p-3.5 rounded-2xl bg-white/15 text-white">
            <Package className="w-6 h-6" />
          </div>
        </div>

        {/* Current Stock */}
        <div className="p-5 rounded-2xl bg-emerald-600 text-white shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-100 uppercase tracking-wider">
              Current Stock
            </p>
            <h3 className="text-3xl font-extrabold mt-1">
              {isLoading ? '...' : (stats?.total_stock_units || 0).toLocaleString()}
            </h3>
          </div>
          <div className="p-3.5 rounded-2xl bg-white/15 text-white">
            <Boxes className="w-6 h-6" />
          </div>
        </div>

        {/* Today's Sales */}
        <div className="p-5 rounded-2xl bg-violet-600 text-white shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-violet-100 uppercase tracking-wider">
              Today's Sales
            </p>
            <h3 className="text-3xl font-extrabold mt-1">
              ₹{isLoading ? '...' : (stats?.today_sales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="p-3.5 rounded-2xl bg-white/15 text-white">
            <IndianRupee className="w-6 h-6" />
          </div>
        </div>

        {/* Bills Generated Today */}
        <div className="p-5 rounded-2xl bg-amber-600 text-white shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-amber-100 uppercase tracking-wider">
              Bills Today
            </p>
            <h3 className="text-3xl font-extrabold mt-1">
              {isLoading ? '...' : (stats?.today_bills_count || 0)}
            </h3>
          </div>
          <div className="p-3.5 rounded-2xl bg-white/15 text-white">
            <Receipt className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Grid: Low Stock Alert & Recent Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Invoices (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base text-slate-800">Recent Bills</h3>
            </div>
            <button
              onClick={() => onNavigate('invoices')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              View All <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-x-auto">
            {stats?.recent_invoices && stats.recent_invoices.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase">
                    <th className="py-2.5 px-3">Invoice #</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Mode</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3 text-center">Print</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.recent_invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3 font-mono font-semibold text-indigo-700">
                        {inv.invoice_number}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-800">
                        {inv.customer_name || 'Counter Customer'}
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        <span className="px-2 py-0.5 rounded bg-slate-100 font-medium text-[10px]">
                          {inv.payment_mode}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-900">
                        ₹{inv.total_amount.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => handlePrintRecent(inv.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-indigo-600 hover:bg-indigo-50 font-semibold text-xs transition-colors"
                          title="Print Bill"
                        >
                          <Printer className="w-3.5 h-3.5" /> Print
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs">
                <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                No invoices generated yet today.
              </div>
            )}
          </div>
        </div>

        {/* Low Stock Watchlist (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-800">Low Stock Alert</h3>
                <p className="text-xs text-slate-500">≤ 5 units remaining</p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('products')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              View Stock <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[320px]">
            {stats?.low_stock_products && stats.low_stock_products.length > 0 ? (
              stats.low_stock_products.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl border border-slate-100 bg-slate-50/70 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <h4 className="font-semibold text-xs text-slate-900 truncate max-w-[180px]">
                      {item.name}
                    </h4>
                    <p className="text-[10px] text-slate-500 font-mono">
                      Code: {item.code} • ₹{item.selling_price.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        item.stock_quantity <= 0
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {item.stock_quantity} {item.unit}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs">
                All products have sufficient stock.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
