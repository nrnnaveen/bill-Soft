import Dexie, { Table } from 'dexie';
import { Product, Invoice, ShopSettings } from '../services/api';

export interface OfflineOutboxItem {
  id?: number;
  client_uuid: string;
  op_type: 'CREATE_INVOICE' | 'ADJUST_STOCK' | 'UPDATE_PRODUCT' | 'UPDATE_SETTINGS';
  payload: any;
  status: 'pending' | 'syncing' | 'failed';
  created_at: string;
  retry_count: number;
  last_error?: string | null;
}

export interface OfflineConflict {
  id?: number;
  conflict_type: string;
  item_id?: string;
  title: string;
  details: string;
  client_value?: string;
  server_value?: string;
  status: 'unresolved' | 'resolved';
  created_at: string;
}

export interface OfflineSettingsRecord extends ShopSettings {
  cached_seal_base64?: string | null;
  device_counter?: number;
}

export class ShopBillingDatabase extends Dexie {
  products!: Table<Product, number>;
  invoices!: Table<Invoice & { is_synced?: boolean; client_uuid?: string | null }, number | string>;
  settings!: Table<OfflineSettingsRecord, number>;
  outbox!: Table<OfflineOutboxItem, number>;
  conflicts!: Table<OfflineConflict, number>;

  constructor() {
    super('ShopBillingOfflineDB');
    this.version(1).stores({
      products: 'id, code, name, is_active',
      invoices: 'id, client_uuid, invoice_number, invoice_date, is_synced',
      settings: 'id',
      outbox: '++id, client_uuid, op_type, status, created_at',
      conflicts: '++id, conflict_type, status, created_at',
    });
  }
}

export const db = new ShopBillingDatabase();
