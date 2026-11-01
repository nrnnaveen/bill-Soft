import React, { useState, useEffect } from 'react';
import { api, InvoiceSummary, Invoice, ShopSettings } from '../services/api';
import { offlineStorage } from '../offline/storage';
import { 
  History, 
  Search, 
  Printer, 
  Calendar, 
  FileText, 
  RefreshCw,
  Eye
} from 'lucide-react';

interface InvoiceHistoryProps {
  settings: ShopSettings;
  onOpenInvoice: (invoice: Invoice) => void;
}

export const InvoiceHistory: React.FC<InvoiceHistoryProps> = ({ onOpenInvoice }) => {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoices = async (searchTerm: string, showSpinner = true) => {
    try {
      if (showSpinner) setIsLoading(true);
      setError(null);
      const data = await api.getInvoices(searchTerm);
      setInvoices(data);
    } catch (err: any) {
      console.warn('Network error fetching invoices, reading local offline store', err);
      try {
        const localInvoices = await offlineStorage.getInvoices();
        const q = searchTerm.trim().toLowerCase();
        const filtered = q
          ? localInvoices.filter(inv =>
              inv.invoice_number.toLowerCase().includes(q) ||
              (inv.customer_name && inv.customer_name.toLowerCase().includes(q))
            )
          : localInvoices;
        setInvoices(
          filtered.map(inv => ({
            id: typeof inv.id === 'number' ? inv.id : 0,
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            customer_name: inv.customer_name,
            payment_mode: inv.payment_mode,
            is_gst_bill: inv.is_gst_bill,
            item_count: inv.items ? inv.items.length : 0,
            total_amount: inv.total_amount,
          }))
        );
      } catch {
        setError(err?.response?.data?.detail || 'Failed to load invoice history.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Immediate local hydration
  useEffect(() => {
    offlineStorage.getInvoices().then(local => {
      if (local && local.length > 0) {
        setInvoices(
          local.map(inv => ({
            id: typeof inv.id === 'number' ? inv.id : 0,
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            customer_name: inv.customer_name,
            payment_mode: inv.payment_mode,
            is_gst_bill: inv.is_gst_bill,
            item_count: inv.items ? inv.items.length : 0,
            total_amount: inv.total_amount,
          }))
        );
        setIsLoading(false);
      }
      fetchInvoices('', local.length === 0);
    });
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchInvoices(search, false);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const handleOpenDetail = async (id: number) => {
    try {
      const fullInvoice = await api.getInvoice(id);
      onOpenInvoice(fullInvoice);
    } catch (err) {
      console.warn('Could not fetch from server, checking local offline DB', err);
      const local = await offlineStorage.getInvoiceById(id);
      if (local) {
        onOpenInvoice(local);
      } else {
        alert('Failed to retrieve full invoice record.');
      }
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <History className="w-6 h-6 text-blue-600" /> Invoice History
          </h2>
        </div>
        <button
          onClick={() => fetchInvoices(search, true)}
          title="Refresh List"
          className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 shadow-sm transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search Filter */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by invoice number, customer name, or phone..."
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          {error}
        </div>
      )}

      {/* Invoice Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            Loading generated invoices...
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            No invoices found matching your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Date &amp; Time</th>
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-4 text-center">Payment Mode</th>
                  <th className="py-3 px-4 text-center">Type</th>
                  <th className="py-3 px-4 text-center">Items</th>
                  <th className="py-3 px-4 text-right">Total Amount (₹)</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-700">
                      {inv.invoice_number}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatDate(inv.invoice_date)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {inv.customer_name || 'Counter Customer'}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                        {inv.payment_mode}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          inv.is_gst_bill
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {inv.is_gst_bill ? 'GST' : 'Non-GST'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center font-medium text-slate-700">
                      {inv.item_count} items
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                      ₹{inv.total_amount.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleOpenDetail(inv.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-xs transition-colors"
                        title="View and print invoice"
                      >
                        <Printer className="w-3.5 h-3.5" /> Print Bill
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
