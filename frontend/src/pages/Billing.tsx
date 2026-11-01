import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  api, 
  Product, 
  InvoiceItemCreate, 
  Invoice, 
  ShopSettings, 
  INDIAN_STATES,
  isValidGstin,
  getStateFromGstin
} from '../services/api';
import { offlineStorage } from '../offline/storage';
import { 
  Search, 
  Trash2, 
  CheckCircle, 
  AlertCircle, 
  Truck, 
  User, 
  Receipt,
  FileText,
  MapPin,
  Tag,
  Plus,
  Minus,
  Printer,
  WifiOff,
  X,
  History,
  Check
} from 'lucide-react';

interface BillingProps {
  settings: ShopSettings;
  onInvoiceCreated: (invoice: Invoice) => void;
}

interface CustomerRecord {
  name: string;
  phone: string;
  address: string;
  gstin: string;
  state: string;
  state_code: string;
}

export const Billing: React.FC<BillingProps> = ({ settings, onInvoiceCreated }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Billing form state
  const [items, setItems] = useState<Array<InvoiceItemCreate & { maxStock: number }>>([]);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [customerState, setCustomerState] = useState(settings?.state || 'Tamilnadu');
  const [customerStateCode, setCustomerStateCode] = useState(settings?.state_code || '33');
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [transportCharges, setTransportCharges] = useState<number>(0);
  const [autoRoundOff, setAutoRoundOff] = useState(false);
  const [notesTerms, setNotesTerms] = useState(settings?.default_terms || '');

  // Past customer autocompletion
  const [pastCustomers, setPastCustomers] = useState<CustomerRecord[]>([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Load products & previous customers for instant auto-completion
  const loadProductsAndCustomers = async () => {
    const local = await offlineStorage.getProducts();
    if (local && local.length > 0) {
      setProducts(local);
    }
    try {
      const data = await api.getProducts();
      setProducts(data);
      await offlineStorage.setProducts(data);
    } catch (err) {
      console.warn('Network error loading products, using offline store', err);
    }

    // Load recent unique customers from past invoices
    try {
      const invoices = await offlineStorage.getInvoices();
      const uniqueMap = new Map<string, CustomerRecord>();
      (invoices || []).forEach(inv => {
        const phone = (inv.customer_phone || '').trim();
        const name = (inv.customer_name || '').trim();
        const key = phone || name;
        if (key && !uniqueMap.has(key)) {
          uniqueMap.set(key, {
            name: inv.customer_name || '',
            phone: inv.customer_phone || '',
            address: inv.customer_address || '',
            gstin: inv.customer_gstin || '',
            state: inv.state || 'Tamilnadu',
            state_code: inv.state_code || '33',
          });
        }
      });
      setPastCustomers(Array.from(uniqueMap.values()));
    } catch (e) {
      console.warn('Could not load past customers for auto-fill', e);
    }
  };

  useEffect(() => {
    loadProductsAndCustomers();
  }, []);

  // Update default state when settings change
  useEffect(() => {
    if (settings) {
      if (!customerState) setCustomerState(settings.state || 'Tamilnadu');
      if (!customerStateCode) setCustomerStateCode(settings.state_code || '33');
      if (!notesTerms) setNotesTerms(settings.default_terms || '');
    }
  }, [settings]);

  // Autocomplete products
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const q = searchQuery.toLowerCase().trim();
    const filtered = products.filter(
      p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
    );
    setSearchResults(filtered);
  }, [searchQuery, products]);

  // Auto-detect State and State Code from GSTIN (First 2 digits represent State Code)
  const handleGstinChange = (val: string) => {
    const clean = val.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15);
    setCustomerGstin(clean);
    if (clean.length >= 2) {
      const matched = getStateFromGstin(clean);
      if (matched) {
        setCustomerState(matched.name);
        setCustomerStateCode(matched.code);
      }
    }
  };

  const handleStateChange = (stateName: string) => {
    setCustomerState(stateName);
    const matched = INDIAN_STATES.find(s => s.name.toLowerCase() === stateName.toLowerCase());
    if (matched) {
      setCustomerStateCode(matched.code);
    }
  };

  // Filtered customer suggestions based on phone or name input
  const customerSuggestions = useMemo(() => {
    const p = customerPhone.trim().toLowerCase();
    const n = customerName.trim().toLowerCase();
    if (!p && !n) return [];
    return pastCustomers.filter(c => {
      const matchP = p && c.phone && c.phone.toLowerCase().includes(p);
      const matchN = n && c.name && c.name.toLowerCase().includes(n);
      return matchP || matchN;
    }).slice(0, 5);
  }, [customerPhone, customerName, pastCustomers]);

  const handleSelectPastCustomer = (cust: CustomerRecord) => {
    if (cust.name) setCustomerName(cust.name);
    if (cust.phone) setCustomerPhone(cust.phone);
    if (cust.address) setCustomerAddress(cust.address);
    if (cust.gstin) {
      setCustomerGstin(cust.gstin);
      handleGstinChange(cust.gstin);
    }
    if (cust.state) setCustomerState(cust.state);
    if (cust.state_code) setCustomerStateCode(cust.state_code);
    setShowCustomerSuggestions(false);
  };

  // Determine if supply is Interstate (IGST) or Intrastate (CGST + SGST)
  const isInterstate = useMemo(() => {
    const shopCode = (settings?.state_code || '33').trim();
    const shopState = (settings?.state || 'Tamilnadu').trim().toLowerCase();
    const custCode = (customerStateCode || '').trim();
    const custState = (customerState || '').trim().toLowerCase();

    if (custCode && shopCode && custCode !== shopCode) return true;
    if (custState && shopState && custState !== shopState) return true;
    return false;
  }, [customerState, customerStateCode, settings]);

  // Real-time GSTIN validation and status message
  const gstinStatus = useMemo(() => {
    if (!customerGstin) return null;
    const len = customerGstin.length;
    const stateMatch = getStateFromGstin(customerGstin);
    if (len < 15) {
      return {
        type: 'info' as const,
        message: `State: ${stateMatch ? `${stateMatch.name} (${stateMatch.code})` : 'Detecting...'} • ${15 - len} characters remaining`,
      };
    }
    const valid = isValidGstin(customerGstin);
    if (valid) {
      return {
        type: 'success' as const,
        message: `✓ Valid GSTIN (PAN: ${customerGstin.substring(2, 12)}) • State: ${stateMatch?.name || customerState} (${stateMatch?.code || customerStateCode}) • ${isInterstate ? 'Interstate (IGST)' : 'Intrastate (CGST+SGST)'}`,
      };
    } else {
      return {
        type: 'warning' as const,
        message: `⚠ Format Error: Expected 2 state digits + 10-char PAN + 1 entity digit + 'Z' + 1 checksum character`,
      };
    }
  }, [customerGstin, customerState, customerStateCode, isInterstate]);

  // Barcode / Search Enter keypress support
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchResults.length > 0) {
      e.preventDefault();
      handleAddProduct(searchResults[0]);
    }
  };

  // Add product to bill
  const handleAddProduct = (product: Product) => {
    if (product.stock_quantity <= 0) {
      setErrorMessage(`Cannot add '${product.name}': 0 ${product.unit} available in stock.`);
      return;
    }

    setErrorMessage(null);
    const existingIndex = items.findIndex(it => it.product_id === product.id);

    if (existingIndex > -1) {
      const current = items[existingIndex];
      if (current.quantity + 1 > product.stock_quantity) {
        setErrorMessage(`Cannot add more: only ${product.stock_quantity} ${product.unit} available in stock for ${product.name}.`);
        return;
      }
      const updated = [...items];
      updated[existingIndex] = {
        ...current,
        quantity: current.quantity + 1,
      };
      setItems(updated);
    } else {
      setItems([
        ...items,
        {
          product_id: product.id,
          product_code: product.code,
          product_name: product.name,
          unit: product.unit,
          quantity: 1,
          unit_price: product.selling_price,
          gst_rate: product.gst_rate,
          maxStock: product.stock_quantity,
        },
      ]);
    }

    setSearchQuery('');
    setSearchResults([]);
  };

  // Adjust quantity with stepper & direct entry
  const handleQuantityChange = (index: number, val: number) => {
    if (isNaN(val)) return;
    const item = items[index];
    let clamped = Math.max(0, val);
    if (clamped > item.maxStock) {
      setErrorMessage(`Only ${item.maxStock} ${item.unit} available in stock for ${item.product_name}.`);
      clamped = item.maxStock;
    } else {
      setErrorMessage(null);
    }

    const updated = [...items];
    updated[index] = {
      ...item,
      quantity: clamped,
    };
    setItems(updated);
  };

  // Adjust unit selling price
  const handlePriceChange = (index: number, val: number) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      unit_price: Math.max(0, val),
    };
    setItems(updated);
  };

  // Adjust GST percentage for item directly in billing
  const handleGstRateChange = (index: number, newRate: number) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      gst_rate: Math.max(0, newRate),
    };
    setItems(updated);
  };

  // Remove item
  const handleRemoveItem = (index: number) => {
    const updated = items.filter((_, idx) => idx !== index);
    setItems(updated);
  };

  // Clear all items with confirmation
  const handleClearAll = () => {
    if (items.length === 0) return;
    if (window.confirm('Are you sure you want to clear all items from this bill?')) {
      setItems([]);
      setErrorMessage(null);
    }
  };

  // Precise Monetary Calculations with Section 15(3) Discount Apportioning & Multi-Rate Breakdowns
  const calculations = useMemo(() => {
    const grossSubtotal = items.reduce(
      (sum, it) => sum + Math.round(it.quantity * it.unit_price * 100) / 100, 
      0
    );
    const discount = Math.min(Math.max(0, Number(discountAmount) || 0), grossSubtotal);
    const transport = Math.round((Number(transportCharges) || 0) * 100) / 100;

    // Pass 1: Deduct proportional discounts from gross per item (Section 15(3) CGST Act)
    let allocatedDiscount = 0;
    const goodsTaxableItems = items.map((it, idx) => {
      const itemGross = Math.round(it.quantity * it.unit_price * 100) / 100;
      let itemDiscount = 0;
      if (discount > 0 && grossSubtotal > 0) {
        if (idx === items.length - 1) {
          itemDiscount = Math.round((discount - allocatedDiscount) * 100) / 100;
        } else {
          itemDiscount = Math.round(((itemGross / grossSubtotal) * discount) * 100) / 100;
          allocatedDiscount += itemDiscount;
        }
      }
      const taxableBase = Math.round(Math.max(0, itemGross - itemDiscount) * 100) / 100;
      return { it, itemGross, itemDiscount, taxableBase };
    });

    const goodsSubtotal = Math.round(goodsTaxableItems.reduce((acc, entry) => acc + entry.taxableBase, 0) * 100) / 100;

    // Pass 2: Apportion incidental transport charges into taxable base for GST (Section 15(2)(c) CGST Act)
    let allocatedTransport = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    const rateBreakdownMap = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();

    goodsTaxableItems.forEach((entry, idx) => {
      let itemTransport = 0;
      if (transport > 0 && goodsSubtotal > 0) {
        if (idx === goodsTaxableItems.length - 1) {
          itemTransport = Math.round((transport - allocatedTransport) * 100) / 100;
        } else {
          itemTransport = Math.round(((entry.taxableBase / goodsSubtotal) * transport) * 100) / 100;
          allocatedTransport += itemTransport;
        }
      }

      const itemEffectiveTaxable = Math.round((entry.taxableBase + itemTransport) * 100) / 100;

      if (entry.it.gst_rate > 0) {
        let cgst = 0;
        let sgst = 0;
        let igst = 0;

        if (isInterstate) {
          igst = Math.round(itemEffectiveTaxable * (entry.it.gst_rate / 100) * 100) / 100;
          totalIgst += igst;
        } else {
          const halfRate = entry.it.gst_rate / 2;
          cgst = Math.round(itemEffectiveTaxable * (halfRate / 100) * 100) / 100;
          sgst = Math.round(itemEffectiveTaxable * (halfRate / 100) * 100) / 100;
          totalCgst += cgst;
          totalSgst += sgst;
        }

        const existing = rateBreakdownMap.get(entry.it.gst_rate) || {
          rate: entry.it.gst_rate,
          taxable: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
        };
        existing.taxable = Math.round((existing.taxable + itemEffectiveTaxable) * 100) / 100;
        existing.cgst = Math.round((existing.cgst + cgst) * 100) / 100;
        existing.sgst = Math.round((existing.sgst + sgst) * 100) / 100;
        existing.igst = Math.round((existing.igst + igst) * 100) / 100;
        rateBreakdownMap.set(entry.it.gst_rate, existing);
      }
    });

    totalCgst = Math.round(totalCgst * 100) / 100;
    totalSgst = Math.round(totalSgst * 100) / 100;
    totalIgst = Math.round(totalIgst * 100) / 100;

    const totalGst = Math.round((totalCgst + totalSgst + totalIgst) * 100) / 100;
    const rawGrandTotal = Math.round((goodsSubtotal + totalGst + transport) * 100) / 100;
    const roundOffDifference = autoRoundOff ? Math.round((Math.round(rawGrandTotal) - rawGrandTotal) * 100) / 100 : 0;
    const grandTotal = autoRoundOff ? Math.round(rawGrandTotal) : rawGrandTotal;

    const rateBreakdowns = Array.from(rateBreakdownMap.values()).sort((a, b) => a.rate - b.rate);

    return {
      grossSubtotal: Math.round(grossSubtotal * 100) / 100,
      discount,
      subtotalBeforeGst: goodsSubtotal,
      totalCgst,
      totalSgst,
      totalIgst,
      totalGst,
      transport,
      rawGrandTotal,
      roundOffDifference,
      grandTotal,
      rateBreakdowns,
    };
  }, [items, isInterstate, discountAmount, transportCharges, autoRoundOff]);

  // Finalize and Generate Bill (Online with Transparent Offline Fallback)
  const handleFinalizeBill = async () => {
    if (items.length === 0) {
      setErrorMessage('Please add at least one product to the bill.');
      return;
    }

    // Validate quantities against available stock
    for (const item of items) {
      if (item.quantity <= 0) {
        setErrorMessage(`Quantity for ${item.product_name} must be greater than zero.`);
        return;
      }
      if (item.quantity > item.maxStock) {
        setErrorMessage(`Quantity for ${item.product_name} (${item.quantity}) exceeds available stock (${item.maxStock}).`);
        return;
      }
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      setInfoMessage(null);

      const isGstInvoice = calculations.totalGst > 0 || Boolean(settings?.gstin);
      const payload = {
        payment_mode: paymentMode,
        customer_name: customerName.trim(),
        customer_address: customerAddress.trim(),
        customer_phone: customerPhone.trim(),
        customer_gstin: customerGstin.trim().toUpperCase(),
        state: customerState.trim() || settings?.state || 'Tamilnadu',
        state_code: customerStateCode.trim() || settings?.state_code || '33',
        is_gst_bill: isGstInvoice,
        discount_amount: calculations.discount,
        transport_charges: Number(transportCharges) || 0,
        items: items.map(it => ({
          product_id: it.product_id,
          product_code: it.product_code,
          product_name: it.product_name,
          unit: it.unit,
          quantity: it.quantity,
          unit_price: it.unit_price,
          gst_rate: it.gst_rate,
        })),
        notes_terms: notesTerms,
      };

      let created: Invoice;
      try {
        created = await api.createInvoice(payload);
      } catch (apiErr: any) {
        // Fallback to offline creation
        if (!navigator.onLine || !apiErr.response) {
          created = await offlineStorage.createInvoiceOffline(payload);
          setInfoMessage('Bill generated in Offline Mode. Stock was deducted locally and bill was queued for sync.');
        } else {
          throw apiErr;
        }
      }

      // Reset form
      setItems([]);
      setCustomerName('');
      setCustomerAddress('');
      setCustomerPhone('');
      setCustomerGstin('');
      setDiscountAmount(0);
      setTransportCharges(0);

      // Refresh product list and customer database
      loadProductsAndCustomers();

      // Trigger print preview
      onInvoiceCreated(created);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to finalize invoice. Please check stock and details.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-emerald-600" /> Create Bill
          </h2>
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-700 text-sm shadow-xs">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600" />
          <span className="font-medium">{errorMessage}</span>
        </div>
      )}

      {infoMessage && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-center gap-3 text-blue-700 text-sm shadow-xs">
          <CheckCircle className="w-5 h-5 flex-shrink-0 text-blue-600" />
          <span className="font-medium">{infoMessage}</span>
        </div>
      )}

      {/* Main Billing Grid: 8 cols left, 4 cols right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Product Selection & Bill Items (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Product Search & Quick Add */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs relative">
            <div className="relative flex items-center">
              <Search className="w-5 h-5 absolute left-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search products by code, name, or scan barcode (Press Enter to add)..."
                className="w-full pl-11 pr-10 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 text-slate-400 hover:text-slate-600 p-1"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Autocomplete Dropdown */}
            {isSearching && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-72 overflow-y-auto z-30 divide-y divide-slate-100">
                {searchResults.map(p => (
                  <div
                    key={p.id}
                    onClick={() => handleAddProduct(p)}
                    className="p-3.5 hover:bg-slate-50 cursor-pointer flex items-center justify-between text-sm transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 flex items-center gap-2">
                        <span>{p.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 font-mono text-slate-600 font-medium">
                          {p.code}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        GST: {p.gst_rate}% • Unit: {p.unit}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-900 font-mono text-sm">
                        ₹{p.selling_price.toFixed(2)}
                      </div>
                      <div className={`text-xs font-medium ${p.stock_quantity > 5 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        Stock: {p.stock_quantity} {p.unit}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Current Bill Items Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" /> Bill Items ({items.length})
              </h3>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline"
                >
                  Clear All
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-600">No products added yet.</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Use the search box above to add products to the bill.
                </p>
              </div>
            ) : (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Item Description</th>
                        <th className="py-2.5 px-3 text-center">Qty</th>
                        <th className="py-2.5 px-3 text-right">Unit Price (₹)</th>
                        <th className="py-2.5 px-3 text-center">GST %</th>
                        <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                        <th className="py-2.5 px-2 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((it, idx) => {
                        const lineGross = it.quantity * it.unit_price;
                        return (
                          <tr key={it.product_id || idx} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-medium text-slate-400">{idx + 1}</td>
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-900">{it.product_name}</div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                {it.product_code} • {it.unit}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {/* Touch-Friendly Stepper Buttons */}
                              <div className="inline-flex items-center rounded-xl border border-slate-300 bg-white shadow-xs overflow-hidden">
                                <button
                                  type="button"
                                  disabled={it.quantity <= 1}
                                  onClick={() => handleQuantityChange(idx, Math.max(1, it.quantity - 1))}
                                  className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors select-none font-bold"
                                  title="Decrease quantity by 1"
                                  aria-label="Decrease quantity"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  max={it.maxStock}
                                  value={it.quantity === 0 ? '' : it.quantity}
                                  placeholder="1"
                                  onFocus={(e) => e.target.select()}
                                  onChange={e => {
                                    const val = e.target.value;
                                    if (val === '') {
                                      handleQuantityChange(idx, 0);
                                      return;
                                    }
                                    const num = parseInt(val, 10);
                                    if (!isNaN(num)) {
                                      handleQuantityChange(idx, num);
                                    }
                                  }}
                                  onBlur={e => {
                                    const n = Number(e.target.value);
                                    if (isNaN(n) || n < 1) handleQuantityChange(idx, 1);
                                  }}
                                  className="w-12 h-8 text-center font-bold text-slate-900 text-xs focus:outline-none focus:bg-indigo-50/50"
                                  aria-label={`Quantity for ${it.product_name}`}
                                />
                                <button
                                  type="button"
                                  disabled={it.quantity >= it.maxStock}
                                  onClick={() => handleQuantityChange(idx, Math.min(it.maxStock, it.quantity + 1))}
                                  className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors select-none font-bold"
                                  title={it.quantity >= it.maxStock ? `Maximum stock reached (${it.maxStock} ${it.unit})` : "Increase quantity by 1"}
                                  aria-label="Increase quantity"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={it.unit_price === 0 ? '' : it.unit_price}
                                placeholder="0.00"
                                onFocus={(e) => e.target.select()}
                                onChange={e => {
                                  const v = e.target.value;
                                  handlePriceChange(idx, v === '' ? 0 : parseFloat(v) || 0);
                                }}
                                onBlur={() => {
                                  if (isNaN(it.unit_price)) handlePriceChange(idx, 0);
                                }}
                                className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-right font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-xs"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <select
                                value={it.gst_rate}
                                onChange={e => handleGstRateChange(idx, Number(e.target.value))}
                                className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                                aria-label={`GST rate for ${it.product_name}`}
                              >
                                <option value={0}>0%</option>
                                <option value={5}>5%</option>
                                <option value={12}>12%</option>
                                <option value={18}>18%</option>
                                <option value={28}>28%</option>
                              </select>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              <div className="font-bold text-slate-900">₹{lineGross.toFixed(2)}</div>
                              {it.gst_rate > 0 && (
                                <div className="text-[10px] text-slate-500 font-medium whitespace-nowrap">
                                  ₹{(lineGross * (1 + it.gst_rate / 100)).toFixed(2)} incl.
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="inline-flex items-center gap-1 p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="Remove item"
                                aria-label={`Remove ${it.product_name}`}
                              >
                                <Trash2 className="w-4 h-4 text-rose-500" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Inline Quick Totals Bar */}
                <div className="bg-slate-50 p-3.5 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-3">
                  <div className="flex items-center gap-4">
                    <span>
                      Total Items: <strong className="text-slate-900">{items.length}</strong>
                    </span>
                    <span>
                      Total Units: <strong className="text-slate-900 font-mono">{items.reduce((s, it) => s + it.quantity, 0)}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-4 font-mono">
                    <span>
                      Total Without GST:{' '}
                      <strong className="text-slate-900">₹{calculations.subtotalBeforeGst.toFixed(2)}</strong>
                    </span>
                    <span>
                      Total GST:{' '}
                      <strong className="text-indigo-700">₹{calculations.totalGst.toFixed(2)}</strong>
                    </span>
                    <span>
                      Total With GST:{' '}
                      <strong className="text-emerald-700 font-bold text-sm">₹{calculations.grandTotal.toFixed(2)}</strong>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Customer Details & Financial Totals (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Customer Details Box */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
            <h3 className="font-bold text-sm text-slate-800 flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="flex items-center gap-1.5">
                <User className="w-4 h-4 text-indigo-600" /> Customer / Party Details
              </span>
              {pastCustomers.length > 0 && (
                <span className="text-[10px] text-slate-400 font-normal">
                  {pastCustomers.length} saved {pastCustomers.length === 1 ? 'party' : 'parties'}
                </span>
              )}
            </h3>

            {/* Customer Name with Autocomplete */}
            <div className="relative">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Customer Name / M/s.
              </label>
              <input
                type="text"
                value={customerName}
                onFocus={() => setShowCustomerSuggestions(true)}
                onChange={e => {
                  setCustomerName(e.target.value);
                  setShowCustomerSuggestions(true);
                }}
                placeholder="e.g. Ramesh Traders"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />

              {/* Suggestions Dropdown */}
              {showCustomerSuggestions && customerSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-40 divide-y divide-slate-100">
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <History className="w-3 h-3 text-slate-400" /> Previous Parties
                    </span>
                    <button 
                      type="button" 
                      onClick={() => setShowCustomerSuggestions(false)} 
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  {customerSuggestions.map((cust, i) => (
                    <div
                      key={i}
                      onClick={() => handleSelectPastCustomer(cust)}
                      className="p-2.5 hover:bg-indigo-50/50 cursor-pointer text-xs transition-colors flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{cust.name || 'Unnamed Party'}</div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                          {cust.phone && <span>📞 {cust.phone}</span>}
                          {cust.gstin && <span className="font-mono text-indigo-700">GST: {cust.gstin}</span>}
                        </div>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono font-medium">
                        {cust.state_code}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Contact Phone
              </label>
              <input
                type="text"
                value={customerPhone}
                onFocus={() => setShowCustomerSuggestions(true)}
                onChange={e => {
                  setCustomerPhone(e.target.value);
                  setShowCustomerSuggestions(true);
                }}
                placeholder="e.g. 9876543210"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* Destination State Selection */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-indigo-500" /> Destination State
                </label>
                <select
                  value={customerState}
                  onChange={e => handleStateChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                >
                  {INDIAN_STATES.map(s => (
                    <option key={s.code} value={s.name}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Code
                </label>
                <input
                  type="text"
                  readOnly
                  value={customerStateCode}
                  className="w-full px-2 py-1.5 rounded-xl border border-slate-200 text-xs text-center font-mono font-bold bg-slate-50 text-slate-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Address
              </label>
              <textarea
                rows={2}
                value={customerAddress}
                onChange={e => setCustomerAddress(e.target.value)}
                placeholder="Street address, city, district"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* GSTIN Input with Live Validation Pill */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold text-slate-600">
                  Party's GSTIN (Optional)
                </label>
                {customerGstin && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    {customerGstin.length}/15
                  </span>
                )}
              </div>
              <input
                type="text"
                value={customerGstin}
                maxLength={15}
                onChange={e => handleGstinChange(e.target.value)}
                placeholder="e.g. 33AAAAA0000A1Z5"
                className={`w-full px-3 py-2 rounded-xl border text-xs font-mono uppercase focus:outline-none focus:ring-2 ${
                  customerGstin.length === 15
                    ? isValidGstin(customerGstin)
                      ? 'border-emerald-300 focus:ring-emerald-500 bg-emerald-50/20'
                      : 'border-amber-300 focus:ring-amber-500 bg-amber-50/20'
                    : 'border-slate-200 focus:ring-indigo-500'
                }`}
              />
              {/* Live GSTIN Status Pill */}
              {gstinStatus && (
                <div className={`mt-1.5 p-2 rounded-lg text-[11px] font-medium flex items-center gap-1.5 ${
                  gstinStatus.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : gstinStatus.type === 'warning'
                    ? 'bg-amber-50 border border-amber-200 text-amber-800'
                    : 'bg-slate-50 border border-slate-200 text-slate-600'
                }`}>
                  {gstinStatus.type === 'success' ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  ) : gstinStatus.type === 'warning' ? (
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                  ) : (
                    <MapPin className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                  )}
                  <span>{gstinStatus.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Payment & Bill Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <h3 className="font-bold text-sm text-slate-800 border-b border-slate-100 pb-2 flex items-center justify-between">
              <span>Bill Summary</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  calculations.totalGst > 0
                    ? isInterstate
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {calculations.totalGst > 0
                  ? isInterstate
                    ? 'Interstate (IGST)'
                    : 'Intrastate (CGST+SGST)'
                  : '0% Tax / Exempt'}
              </span>
            </h3>

            {/* Payment Mode */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Payment Mode
              </label>
              <select
                value={paymentMode}
                onChange={e => setPaymentMode(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI / GPay / PhonePe</option>
                <option value="Card">Credit / Debit Card</option>
                <option value="Net Banking">Net Banking</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>

            {/* Discounts and Transport */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-amber-600" /> Discount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discountAmount === 0 ? '' : discountAmount}
                  placeholder="0.00"
                  onFocus={(e) => e.target.select()}
                  onChange={e => {
                    const v = e.target.value;
                    setDiscountAmount(v === '' ? 0 : Math.max(0, parseFloat(v) || 0));
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-blue-600" /> Transport (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={transportCharges === 0 ? '' : transportCharges}
                  placeholder="0.00"
                  onFocus={(e) => e.target.select()}
                  onChange={e => {
                    const v = e.target.value;
                    setTransportCharges(v === '' ? 0 : Math.max(0, parseFloat(v) || 0));
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Tax Breakdown Display */}
            <div className="space-y-2.5 pt-3 border-t border-slate-100 text-xs">
              {calculations.discount > 0 ? (
                <>
                  <div className="flex justify-between text-slate-500">
                    <span>Gross Amount:</span>
                    <span className="font-mono">₹{calculations.grossSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-amber-700">
                    <span>Discount Deducted:</span>
                    <span className="font-mono">-₹{calculations.discount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-800 font-semibold">
                    <span>Total Without GST (Subtotal):</span>
                    <span className="font-mono">₹{calculations.subtotalBeforeGst.toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-slate-800 font-semibold">
                  <span>Total Without GST (Subtotal):</span>
                  <span className="font-mono">₹{calculations.subtotalBeforeGst.toFixed(2)}</span>
                </div>
              )}

              {/* Multi-rate or Single-rate GST breakdown */}
              {calculations.totalGst > 0 ? (
                <>
                  {calculations.rateBreakdowns.length > 1 ? (
                    <div className="space-y-1.5 py-1 px-2 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                        Rate-wise Tax Breakup
                      </div>
                      {calculations.rateBreakdowns.map(rb => (
                        <div key={rb.rate} className="text-[11px] text-slate-700 space-y-0.5">
                          {isInterstate ? (
                            <div className="flex justify-between">
                              <span>IGST ({rb.rate}% on ₹{rb.taxable.toFixed(2)}):</span>
                              <span className="font-mono text-purple-700">₹{rb.igst.toFixed(2)}</span>
                            </div>
                          ) : (
                            <>
                              <div className="flex justify-between">
                                <span>CGST ({rb.rate / 2}% on ₹{rb.taxable.toFixed(2)}):</span>
                                <span className="font-mono text-indigo-700">₹{rb.cgst.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>SGST ({rb.rate / 2}% on ₹{rb.taxable.toFixed(2)}):</span>
                                <span className="font-mono text-indigo-700">₹{rb.sgst.toFixed(2)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Single Rate */
                    isInterstate ? (
                      <div className="flex justify-between text-slate-700">
                        <span>IGST {calculations.rateBreakdowns[0] ? `(${calculations.rateBreakdowns[0].rate}%)` : ''}:</span>
                        <span className="font-mono text-purple-700">₹{calculations.totalIgst.toFixed(2)}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between text-slate-700">
                          <span>CGST {calculations.rateBreakdowns[0] ? `(${calculations.rateBreakdowns[0].rate / 2}%)` : ''}:</span>
                          <span className="font-mono text-indigo-700">₹{calculations.totalCgst.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-slate-700">
                          <span>SGST {calculations.rateBreakdowns[0] ? `(${calculations.rateBreakdowns[0].rate / 2}%)` : ''}:</span>
                          <span className="font-mono text-indigo-700">₹{calculations.totalSgst.toFixed(2)}</span>
                        </div>
                      </>
                    )
                  )}

                  <div className="flex justify-between font-semibold text-slate-800 pt-1 border-t border-dashed border-slate-200">
                    <span>Total GST:</span>
                    <span className="font-mono text-indigo-900">₹{calculations.totalGst.toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-slate-500">
                  <span>Total GST:</span>
                  <span className="font-mono">₹0.00 (0% / Exempt)</span>
                </div>
              )}

              {calculations.transport > 0 && (
                <div className="flex justify-between text-slate-700">
                  <span>Transport Charges:</span>
                  <span className="font-mono">₹{calculations.transport.toFixed(2)}</span>
                </div>
              )}

              {/* Optional Auto Round-Off Toggle */}
              <div className="flex items-center justify-between py-1.5 px-2 bg-slate-50/80 rounded-xl border border-slate-200/80 text-[11px] text-slate-700">
                <span className="font-medium">Round Off to Nearest Rupee</span>
                <input
                  type="checkbox"
                  checked={autoRoundOff}
                  onChange={e => setAutoRoundOff(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                  title="Toggle automatic rupee rounding"
                />
              </div>

              {autoRoundOff && calculations.roundOffDifference !== 0 && (
                <div className="flex justify-between text-slate-600 text-xs">
                  <span>Round Off Adjustment:</span>
                  <span className="font-mono">
                    {calculations.roundOffDifference > 0 ? `+₹${calculations.roundOffDifference.toFixed(2)}` : `-₹${Math.abs(calculations.roundOffDifference).toFixed(2)}`}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-base font-extrabold text-slate-900 pt-2 border-t-2 border-slate-200">
                <span>Total With GST (Grand Total):</span>
                <span className="text-emerald-700 font-mono">₹{calculations.grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Print Bill Button */}
            <button
              type="button"
              disabled={isSubmitting || items.length === 0}
              onClick={handleFinalizeBill}
              className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm text-white shadow-md flex items-center justify-center gap-2 transition-all ${
                isSubmitting || items.length === 0
                  ? 'bg-slate-300 cursor-not-allowed shadow-none'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:scale-98 shadow-emerald-200'
              }`}
            >
              <Printer className="w-5 h-5" />
              <span>{isSubmitting ? 'Creating Bill...' : 'Print Bill'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
