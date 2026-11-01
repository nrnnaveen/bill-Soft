import axios from 'axios';

// Dynamic Backend Base URL Resolver supporting Web, Android Capacitor, and Desktop Electron
export function resolveApiBase(): string {
  const custom = typeof window !== 'undefined' ? localStorage.getItem('SHOP_BILLING_API_BASE') : null;
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, '');
  }
  if ((import.meta as any).env?.VITE_API_URL) {
    return ((import.meta as any).env.VITE_API_URL as string).trim().replace(/\/+$/, '');
  }
  // If running in Electron via file:// protocol
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return 'http://127.0.0.1:8000/api';
  }
  // If running in Capacitor Android native app
  if (typeof window !== 'undefined' && ((window as any).Capacitor?.isNativePlatform?.() || window.location.origin.includes('localhost'))) {
    const capHost = localStorage.getItem('CAPACITOR_API_HOST') || 'http://127.0.0.1:8000/api';
    return capHost;
  }
  return '/api';
}

export let API_BASE = resolveApiBase();

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});


export interface Product {
  id: number;
  code: string;
  name: string;
  unit: string;
  selling_price: number;
  gst_rate: number;
  stock_quantity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductCreate {
  code: string;
  name: string;
  unit: string;
  selling_price: number;
  gst_rate: number;
  stock_quantity: number;
}

export interface ProductUpdate {
  code?: string;
  name?: string;
  unit?: string;
  selling_price?: number;
  gst_rate?: number;
  stock_quantity?: number;
}

export interface StockMovement {
  id: number;
  product_id: number;
  invoice_id?: number | null;
  movement_type: string;
  quantity: number;
  balance_after: number;
  notes?: string | null;
  created_at: string;
}

export interface InvoiceItemCreate {
  product_id?: number;
  product_code: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  gst_rate: number;
}

export interface InvoiceItem {
  id: number;
  invoice_id: number;
  product_id?: number | null;
  product_code: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  gst_rate: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
}

export interface InvoiceCreate {
  payment_mode: string;
  customer_name?: string;
  customer_address?: string;
  customer_phone?: string;
  customer_gstin?: string;
  state?: string;
  state_code?: string;
  is_gst_bill: boolean;
  discount_amount?: number;
  transport_charges: number;
  items: InvoiceItemCreate[];
  notes_terms?: string;
  client_uuid?: string;
  offline_invoice_number?: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  payment_mode: string;
  customer_name?: string | null;
  customer_address?: string | null;
  customer_phone?: string | null;
  customer_gstin?: string | null;
  state: string;
  state_code: string;
  is_gst_bill: boolean;
  discount_amount?: number;
  transport_charges: number;
  subtotal: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_tax: number;
  total_amount: number;
  total_amount_words?: string | null;
  terms_and_conditions?: string | null;
  client_uuid?: string | null;
  device_id?: string | null;
  is_synced?: boolean;
  created_at: string;
  items: InvoiceItem[];
}

export interface InvoiceSummary {
  id: number;
  invoice_number: string;
  invoice_date: string;
  customer_name?: string | null;
  payment_mode: string;
  is_gst_bill: boolean;
  item_count: number;
  total_amount: number;
}

export interface ShopSettings {
  id: number;
  shop_name: string;
  address: string;
  gstin?: string | null;
  email?: string | null;
  contact_no?: string | null;
  state: string;
  state_code: string;
  invoice_prefix: string;
  device_invoice_prefix?: string;
  next_invoice_number: number;
  default_terms: string;
  seal_image_path?: string | null;
  default_is_gst: boolean;
  updated_at: string;
}

export interface DashboardStats {
  total_products: number;
  total_stock_units: number;
  today_sales: number;
  today_bills_count: number;
  low_stock_products_count: number;
  low_stock_products: Array<{
    id: number;
    code: string;
    name: string;
    stock_quantity: number;
    unit: string;
    selling_price: number;
  }>;
  recent_invoices: Array<{
    id: number;
    invoice_number: string;
    invoice_date: string;
    customer_name?: string | null;
    total_amount: number;
    payment_mode: string;
    is_gst_bill: boolean;
  }>;
}

// API Functions
export const api = {
  // Products
  async getProducts(search?: string): Promise<Product[]> {
    const params = search ? { search } : {};
    const res = await apiClient.get<Product[]>('/products', { params });
    return res.data;
  },

  async createProduct(data: ProductCreate): Promise<Product> {
    const res = await apiClient.post<Product>('/products', data);
    return res.data;
  },

  async updateProduct(id: number, data: ProductUpdate): Promise<Product> {
    const res = await apiClient.put<Product>(`/products/${id}`, data);
    return res.data;
  },

  async restockProduct(id: number, quantity: number, notes?: string): Promise<Product> {
    const res = await apiClient.post<Product>(`/products/${id}/restock`, { quantity, notes });
    return res.data;
  },

  async deleteProduct(id: number): Promise<{ message: string }> {
    const res = await apiClient.delete<{ message: string }>(`/products/${id}`);
    return res.data;
  },

  async getProductMovements(id: number): Promise<StockMovement[]> {
    const res = await apiClient.get<StockMovement[]>(`/products/${id}/movements`);
    return res.data;
  },

  // Invoices
  async getInvoices(search?: string): Promise<InvoiceSummary[]> {
    const params = search ? { search } : {};
    const res = await apiClient.get<InvoiceSummary[]>('/invoices', { params });
    return res.data;
  },

  async getInvoice(id: number): Promise<Invoice> {
    const res = await apiClient.get<Invoice>(`/invoices/${id}`);
    return res.data;
  },

  async createInvoice(data: InvoiceCreate): Promise<Invoice> {
    const res = await apiClient.post<Invoice>('/invoices', data);
    return res.data;
  },

  async getDashboardStats(): Promise<DashboardStats> {
    const res = await apiClient.get<DashboardStats>('/invoices/stats/dashboard');
    return res.data;
  },

  // Settings
  async getSettings(): Promise<ShopSettings> {
    const res = await apiClient.get<ShopSettings>('/settings');
    return res.data;
  },

  async updateSettings(data: Partial<ShopSettings>): Promise<ShopSettings> {
    const res = await apiClient.put<ShopSettings>('/settings', data);
    return res.data;
  },

  async uploadSeal(file: File): Promise<ShopSettings> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post<ShopSettings>('/settings/seal', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },

  async deleteSeal(): Promise<ShopSettings> {
    const res = await apiClient.delete<ShopSettings>('/settings/seal');
    return res.data;
  },

  async triggerBackup(): Promise<{ status: string; message: string; export_log: string; seal_log: string }> {
    const res = await apiClient.post('/settings/backup');
    return res.data;
  },

  getSealImageUrl(): string {
    return `${API_BASE}/settings/seal-image?t=${Date.now()}`;
  },

  async getSealImageBase64(): Promise<string | null> {
    try {
      const res = await apiClient.get('/settings/seal-image', { responseType: 'blob' });
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(res.data);
      });
    } catch {
      return null;
    }
  },

  async healthCheck(): Promise<boolean> {
    try {
      const res = await apiClient.get('/health', { timeout: 3000 });
      return res.status === 200;
    } catch {
      return false;
    }
  },

  async syncPush(payload: any): Promise<any> {
    const res = await apiClient.post('/sync/push', payload);
    return res.data;
  },

  async syncPull(): Promise<any> {
    const res = await apiClient.get('/sync/pull');
    return res.data;
  },

  getApiBaseUrl(): string {
    return API_BASE;
  },

  setApiBaseUrl(newBaseUrl: string) {
    const trimmed = newBaseUrl.trim().replace(/\/+$/, '');
    if (typeof window !== 'undefined') {
      localStorage.setItem('SHOP_BILLING_API_BASE', trimmed);
    }
    API_BASE = trimmed;
    apiClient.defaults.baseURL = trimmed;
  },

  async getDbStatus(): Promise<any> {
    try {
      const res = await apiClient.get('/settings/db-status', { timeout: 3000 });
      return res.data;
    } catch {
      return null;
    }
  },
};

export const INDIAN_STATES = [
  { name: 'Jammu and Kashmir', code: '01' },
  { name: 'Himachal Pradesh', code: '02' },
  { name: 'Punjab', code: '03' },
  { name: 'Chandigarh', code: '04' },
  { name: 'Uttarakhand', code: '05' },
  { name: 'Haryana', code: '06' },
  { name: 'Delhi', code: '07' },
  { name: 'Rajasthan', code: '08' },
  { name: 'Uttar Pradesh', code: '09' },
  { name: 'Bihar', code: '10' },
  { name: 'Sikkim', code: '11' },
  { name: 'Arunachal Pradesh', code: '12' },
  { name: 'Nagaland', code: '13' },
  { name: 'Manipur', code: '14' },
  { name: 'Mizoram', code: '15' },
  { name: 'Tripura', code: '16' },
  { name: 'Meghalaya', code: '17' },
  { name: 'Assam', code: '18' },
  { name: 'West Bengal', code: '19' },
  { name: 'Jharkhand', code: '20' },
  { name: 'Odisha', code: '21' },
  { name: 'Chhattisgarh', code: '22' },
  { name: 'Madhya Pradesh', code: '23' },
  { name: 'Gujarat', code: '24' },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', code: '26' },
  { name: 'Maharashtra', code: '27' },
  { name: 'Karnataka', code: '29' },
  { name: 'Goa', code: '30' },
  { name: 'Lakshadweep', code: '31' },
  { name: 'Kerala', code: '32' },
  { name: 'Tamilnadu', code: '33' },
  { name: 'Puducherry', code: '34' },
  { name: 'Andaman and Nicobar Islands', code: '35' },
  { name: 'Telangana', code: '36' },
  { name: 'Andhra Pradesh', code: '37' },
  { name: 'Ladakh', code: '38' },
  { name: 'Other Territory', code: '97' },
];

/**
 * Validates 15-character Indian GSTIN format.
 * Format: 2 digits (State Code) + 10 chars (PAN) + 1 digit (Entity) + 'Z' + 1 checksum char.
 */
export const isValidGstin = (gstin: string): boolean => {
  if (!gstin) return false;
  const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return regex.test(gstin.trim().toUpperCase());
};

/**
 * Resolves Indian state name and code from the first 2 digits of a GSTIN.
 */
export const getStateFromGstin = (gstin: string): { name: string; code: string } | null => {
  if (!gstin || gstin.trim().length < 2) return null;
  const code = gstin.trim().substring(0, 2);
  const found = INDIAN_STATES.find(s => s.code === code);
  return found || null;
};


