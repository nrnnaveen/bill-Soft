import { db, OfflineOutboxItem, OfflineConflict, OfflineSettingsRecord } from './db';
import { 
  Product, 
  Invoice, 
  InvoiceCreate, 
  ShopSettings,
  DEFAULT_SHOP_SETTINGS,
  DEFAULT_INITIAL_PRODUCTS
} from '../services/api';

export function numberToWordsIndian(num: number): string {
  if (num === null || num === undefined || isNaN(num)) return '';
  const rounded = Math.round(num * 100) / 100;
  let rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  if (rupees === 0 && paise === 0) return 'Rupees Zero Only';

  const units = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
  ];

  function twoDigits(n: number): string {
    if (n === 0) return '';
    if (n < 20) return units[n];
    const rem = n % 10;
    return (tens[Math.floor(n / 10)] + (rem > 0 ? ' ' + units[rem] : '')).trim();
  }

  function threeDigits(n: number): string {
    const h = Math.floor(n / 100);
    const rem = n % 100;
    let res = '';
    if (h > 0) {
      res += units[h] + ' Hundred';
      if (rem > 0) res += ' and ';
    }
    if (rem > 0) res += twoDigits(rem);
    return res.trim();
  }

  const parts: string[] = [];
  const crores = Math.floor(rupees / 10000000);
  rupees %= 10000000;
  if (crores > 0) parts.push(twoDigits(crores) + ' Crore');

  const lakhs = Math.floor(rupees / 100000);
  rupees %= 100000;
  if (lakhs > 0) parts.push(twoDigits(lakhs) + ' Lakh');

  const thousands = Math.floor(rupees / 1000);
  rupees %= 1000;
  if (thousands > 0) parts.push(twoDigits(thousands) + ' Thousand');

  if (rupees > 0) parts.push(threeDigits(rupees));

  const rupeesStr = parts.length > 0 ? parts.join(' ').trim() : 'Zero';
  let result = `Rupees ${rupeesStr}`;
  if (paise > 0) {
    result += ` and ${twoDigits(paise)} Paise`;
  }
  result += ' Only';
  return result;
}

export const offlineStorage = {
  // Products
  async getProducts(): Promise<Product[]> {
    const local = await db.products.toArray();
    if (!local || local.length === 0) {
      await db.products.bulkPut(DEFAULT_INITIAL_PRODUCTS);
      return DEFAULT_INITIAL_PRODUCTS;
    }
    return local;
  },

  async setProducts(products: Product[]): Promise<void> {
    if (!Array.isArray(products) || products.length === 0) return;
    await db.products.clear();
    await db.products.bulkPut(products);
  },

  async updateProduct(product: Product): Promise<void> {
    await db.products.put(product);
  },

  // Settings
  async getSettings(): Promise<OfflineSettingsRecord> {
    const current = await db.settings.get(1);
    if (!current || !current.shop_name) {
      const initial: OfflineSettingsRecord = {
        ...DEFAULT_SHOP_SETTINGS,
        id: 1,
        cached_seal_base64: null,
        device_counter: 1,
      };
      await db.settings.put(initial);
      return initial;
    }
    return current;
  },

  async setSettings(settings: ShopSettings, sealBase64?: string | null): Promise<void> {
    const current = await db.settings.get(1);
    const toSave: OfflineSettingsRecord = {
      ...settings,
      id: 1,
      cached_seal_base64: sealBase64 !== undefined ? sealBase64 : (current?.cached_seal_base64 || null),
      device_counter: current?.device_counter || 1,
    };
    await db.settings.put(toSave);
  },

  // Invoices
  async getInvoices(): Promise<Invoice[]> {
    return (await db.invoices.reverse().sortBy('invoice_date')) as Invoice[];
  },

  async getInvoiceById(id: number | string): Promise<Invoice | undefined> {
    return (await db.invoices.get(id)) as Invoice | undefined;
  },

  // Offline Invoice Creation
  async createInvoiceOffline(payload: InvoiceCreate): Promise<Invoice> {
    const settings = await this.getSettings();
    const devicePrefix = settings?.device_invoice_prefix || 'INV-DEV1-';
    const counter = settings?.device_counter || 1;
    const offlineNumber = `${devicePrefix}${String(counter).padStart(4, '0')}`;

    // Update next counter
    if (settings) {
      settings.device_counter = counter + 1;
      await db.settings.put(settings);
    }

    // Deduct stock in local Dexie store
    for (const item of payload.items) {
      if (item.product_id) {
        const prod = await db.products.get(item.product_id);
        if (prod) {
          prod.stock_quantity = Math.max(0, prod.stock_quantity - item.quantity);
          await db.products.put(prod);
        }
      }
    }

    // Determine interstate vs intrastate
    const shopCode = (settings?.state_code || '33').trim();
    const shopState = (settings?.state || 'Tamilnadu').trim().toLowerCase();
    let custCode = (payload.state_code || '').trim();
    const custState = (payload.state || '').trim().toLowerCase();

    // If customer GSTIN is provided, derive state code from first 2 digits if not explicitly set
    const gstin = (payload.customer_gstin || '').trim().toUpperCase();
    if (gstin && gstin.length >= 2 && /^\d{2}/.test(gstin)) {
      if (!payload.state_code || payload.state_code === settings?.state_code) {
        custCode = gstin.substring(0, 2);
      }
    }

    const isInterstate = Boolean(
      (custCode && shopCode && custCode !== shopCode) ||
      (custState && shopState && custState !== shopState)
    );

    // Calculate totals and apportion discount
    const grossSubtotal = payload.items.reduce(
      (sum, it) => sum + Math.round(it.quantity * it.unit_price * 100) / 100, 
      0
    );
    const discount = Math.min(Math.max(0, payload.discount_amount || 0), grossSubtotal);

    const transport = Math.round((payload.transport_charges || 0) * 100) / 100;

    // Pass 1: compute goods taxable base per item after discount
    let allocatedDiscount = 0;
    const goodsTaxableItems = payload.items.map((it, idx) => {
      const itemGross = Math.round(it.quantity * it.unit_price * 100) / 100;
      let itemDiscount = 0;
      if (discount > 0 && grossSubtotal > 0) {
        if (idx === payload.items.length - 1) {
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

    // Pass 2: Apportion transport charges as incidental expenses into taxable value for GST (Section 15(2)(c) CGST Act)
    let allocatedTransport = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    const invoiceItems = goodsTaxableItems.map((entry, idx) => {
      let itemTransport = 0;
      if (payload.is_gst_bill && transport > 0 && goodsSubtotal > 0) {
        if (idx === goodsTaxableItems.length - 1) {
          itemTransport = Math.round((transport - allocatedTransport) * 100) / 100;
        } else {
          itemTransport = Math.round(((entry.taxableBase / goodsSubtotal) * transport) * 100) / 100;
          allocatedTransport += itemTransport;
        }
      }

      const itemEffectiveTaxable = Math.round((entry.taxableBase + itemTransport) * 100) / 100;

      let cgst = 0;
      let sgst = 0;
      let igst = 0;

      if (payload.is_gst_bill && entry.it.gst_rate > 0) {
        if (isInterstate) {
          igst = Math.round(itemEffectiveTaxable * (entry.it.gst_rate / 100) * 100) / 100;
        } else {
          const halfRate = entry.it.gst_rate / 2;
          cgst = Math.round(itemEffectiveTaxable * (halfRate / 100) * 100) / 100;
          sgst = Math.round(itemEffectiveTaxable * (halfRate / 100) * 100) / 100;
        }
      }

      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;

      return {
        id: Math.floor(Math.random() * 1000000),
        invoice_id: 0,
        product_id: entry.it.product_id,
        product_code: entry.it.product_code,
        product_name: entry.it.product_name,
        unit: entry.it.unit,
        quantity: entry.it.quantity,
        unit_price: entry.it.unit_price,
        gst_rate: payload.is_gst_bill ? entry.it.gst_rate : 0,
        taxable_amount: entry.taxableBase,
        cgst_amount: cgst,
        sgst_amount: sgst,
        igst_amount: igst,
        total_amount: Math.round((entry.taxableBase + itemTransport + cgst + sgst + igst) * 100) / 100,
      };
    });

    const subtotal = goodsSubtotal;
    totalCgst = Math.round(totalCgst * 100) / 100;
    totalSgst = Math.round(totalSgst * 100) / 100;
    totalIgst = Math.round(totalIgst * 100) / 100;
    const totalTax = payload.is_gst_bill ? Math.round((totalCgst + totalSgst + totalIgst) * 100) / 100 : 0;
    const finalTotal = Math.round((subtotal + totalTax + transport) * 100) / 100;
    const words = numberToWordsIndian(finalTotal);

    const clientUuid = `offline-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const newInvoice: Invoice & { is_synced: boolean; client_uuid: string } = {
      id: Math.floor(Date.now() / 1000),
      invoice_number: offlineNumber,
      invoice_date: new Date().toISOString(),
      payment_mode: payload.payment_mode,
      customer_name: payload.customer_name || '',
      customer_address: payload.customer_address || '',
      customer_phone: payload.customer_phone || '',
      customer_gstin: payload.customer_gstin || '',
      state: payload.state || settings?.state || 'Tamilnadu',
      state_code: payload.state_code || settings?.state_code || '33',
      is_gst_bill: payload.is_gst_bill,
      discount_amount: discount,
      transport_charges: transport,
      subtotal,
      cgst_amount: totalCgst,
      sgst_amount: totalSgst,
      igst_amount: totalIgst,
      total_tax: totalTax,
      total_amount: finalTotal,
      total_amount_words: words,
      terms_and_conditions: payload.notes_terms || settings?.default_terms,
      created_at: new Date().toISOString(),
      items: invoiceItems,
      is_synced: false,
      client_uuid: clientUuid,
    };

    // Save to Dexie invoices
    await db.invoices.put(newInvoice);

    // Queue in outbox
    const outboxItem: OfflineOutboxItem = {
      client_uuid: clientUuid,
      op_type: 'CREATE_INVOICE',
      payload: {
        ...payload,
        client_uuid: clientUuid,
        offline_invoice_number: offlineNumber,
      },
      status: 'pending',
      created_at: new Date().toISOString(),
      retry_count: 0,
    };
    await db.outbox.add(outboxItem);

    return newInvoice;
  },

  // Outbox operations
  async getPendingOutbox(): Promise<OfflineOutboxItem[]> {
    return await db.outbox.filter(item => item.status === 'pending' || item.status === 'failed').toArray();
  },

  async markOutboxSyncing(ids: number[]): Promise<void> {
    for (const id of ids) {
      await db.outbox.update(id, { status: 'syncing' });
    }
  },

  async removeOutboxItems(ids: number[]): Promise<void> {
    await db.outbox.bulkDelete(ids);
  },

  async markOutboxFailed(id: number, error: string): Promise<void> {
    const item = await db.outbox.get(id);
    if (item) {
      await db.outbox.update(id, {
        status: 'failed',
        retry_count: (item.retry_count || 0) + 1,
        last_error: error,
      });
    }
  },

  // Conflicts
  async getConflicts(): Promise<OfflineConflict[]> {
    return await db.conflicts.filter(c => c.status === 'unresolved').toArray();
  },

  async addConflicts(conflicts: OfflineConflict[]): Promise<void> {
    await db.conflicts.bulkAdd(conflicts);
  },

  async resolveConflict(id: number): Promise<void> {
    await db.conflicts.update(id, { status: 'resolved' });
  },

  // Export / Import
  async exportData(): Promise<string> {
    const products = await db.products.toArray();
    const invoices = await db.invoices.toArray();
    const settings = await db.settings.get(1);
    const conflicts = await db.conflicts.toArray();
    const backup = {
      version: 1,
      exported_at: new Date().toISOString(),
      products,
      invoices,
      settings,
      conflicts,
    };
    return JSON.stringify(backup, null, 2);
  },

  async importData(jsonString: string): Promise<void> {
    const data = JSON.parse(jsonString);
    if (!data || !data.version) {
      throw new Error('Invalid backup file format.');
    }
    if (Array.isArray(data.products)) {
      await db.products.clear();
      await db.products.bulkPut(data.products);
    }
    if (Array.isArray(data.invoices)) {
      await db.invoices.clear();
      await db.invoices.bulkPut(data.invoices);
    }
    if (data.settings) {
      await db.settings.put(data.settings);
    }
    if (Array.isArray(data.conflicts)) {
      await db.conflicts.clear();
      await db.conflicts.bulkAdd(data.conflicts);
    }
  },
};
