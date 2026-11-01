import { api, ShopSettings } from '../services/api';
import { offlineStorage } from '../offline/storage';
import { db, OfflineConflict } from '../offline/db';

export type SyncState = 'online-synced' | 'offline' | 'sync-pending' | 'sync-failed' | 'conflict';

export interface SyncEngineStatus {
  state: SyncState;
  isOnline: boolean;
  pendingCount: number;
  conflictCount: number;
  lastSyncedAt: Date | null;
  errorMessage: string | null;
}

type StatusListener = (status: SyncEngineStatus) => void;

class SyncEngine {
  private deviceId: string;
  private listeners: Set<StatusListener> = new Set();
  private isSyncing = false;
  private timer: any = null;

  private currentStatus: SyncEngineStatus = {
    state: 'online-synced',
    isOnline: navigator.onLine,
    pendingCount: 0,
    conflictCount: 0,
    lastSyncedAt: null,
    errorMessage: null,
  };

  constructor() {
    // Generate or retrieve persistent device ID
    let devId = localStorage.getItem('shop_billing_device_id');
    if (!devId) {
      devId = `DEV-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      localStorage.setItem('shop_billing_device_id', devId);
    }
    this.deviceId = devId;

    // Listen to browser network status
    window.addEventListener('online', () => this.handleNetworkChange(true));
    window.addEventListener('offline', () => this.handleNetworkChange(false));

    // Initial check
    setTimeout(() => {
      this.syncNow();
      this.startAutoSync();
    }, 1000);
  }

  public getDeviceId(): string {
    return this.deviceId;
  }

  public getStatus(): SyncEngineStatus {
    return { ...this.currentStatus };
  }

  public subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const status = this.getStatus();
    this.listeners.forEach(fn => fn(status));
  }

  private handleNetworkChange(online: boolean) {
    this.currentStatus.isOnline = online;
    if (online) {
      this.syncNow();
    } else {
      this.currentStatus.state = 'offline';
      this.notify();
    }
  }

  public startAutoSync(intervalMs: number = 30000) {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (navigator.onLine && !this.isSyncing) {
        this.syncNow();
      }
    }, intervalMs);
  }

  public async syncNow(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const conflicts = await offlineStorage.getConflicts();
      const pendingOutbox = await offlineStorage.getPendingOutbox();
      this.currentStatus.conflictCount = conflicts.length;
      this.currentStatus.pendingCount = pendingOutbox.length;

      // 1. Check network connectivity with backend
      const isBackendAlive = await api.healthCheck();
      if (!isBackendAlive) {
        this.currentStatus.isOnline = false;
        this.currentStatus.state = 'offline';
        this.notify();
        this.isSyncing = false;
        return;
      }

      this.currentStatus.isOnline = true;

      // If outbox items exist, transition to sync-pending state
      if (pendingOutbox.length > 0) {
        this.currentStatus.state = 'sync-pending';
        this.notify();

        // 2. Push Outbox items to server
        const invoicePayloads = pendingOutbox
          .filter(it => it.op_type === 'CREATE_INVOICE')
          .map(it => it.payload);

        const pushRes = await api.syncPush({
          device_id: this.deviceId,
          invoices: invoicePayloads,
          stock_adjustments: [],
          products: [],
        });

        // Mark synced invoices locally in Dexie database
        if (pushRes.synced_invoices && pushRes.synced_invoices.length > 0) {
          const localInvs = await offlineStorage.getInvoices();
          for (const item of pushRes.synced_invoices) {
            const matched = localInvs.find(inv => (inv as any).client_uuid === item.client_uuid);
            if (matched) {
              matched.is_synced = true;
              matched.invoice_number = item.server_invoice_number;
              if (item.server_id && item.server_id !== matched.id) {
                await db.invoices.delete(matched.id);
                matched.id = item.server_id;
              }
              await db.invoices.put(matched);
            }
          }
        }

        // Record any server-reported conflicts
        if (pushRes.conflicts && pushRes.conflicts.length > 0) {
          const conflictRecords: OfflineConflict[] = pushRes.conflicts.map((c: any) => ({
            conflict_type: c.conflict_type,
            item_id: c.item_id,
            title: c.title,
            details: c.details,
            client_value: c.client_value,
            server_value: c.server_value,
            status: 'unresolved',
            created_at: c.timestamp || new Date().toISOString(),
          }));
          await offlineStorage.addConflicts(conflictRecords);
        }

        // Clear pushed outbox items
        const outboxIds = pendingOutbox.map(it => it.id!).filter(Boolean);
        await offlineStorage.removeOutboxItems(outboxIds);
      }

      // 3. Pull latest data from server
      const pullData = await api.syncPull();

      if (pullData.products) {
        await offlineStorage.setProducts(pullData.products);
      }

      if (pullData.invoices && pullData.invoices.length > 0) {
        // Merge recent server invoice summaries into offline cache if not present
        for (const sInv of pullData.invoices) {
          const existing = await db.invoices.get(sInv.id);
          if (!existing) {
            const byNum = await db.invoices.where('invoice_number').equals(sInv.invoice_number).first();
            if (!byNum) {
              await db.invoices.put({
                ...sInv,
                is_synced: true,
                items: [],
                subtotal: sInv.total_amount,
                cgst_amount: 0,
                sgst_amount: 0,
                igst_amount: 0,
                total_tax: 0,
                transport_charges: 0,
                state: 'Tamilnadu',
                state_code: '33',
                created_at: sInv.invoice_date,
              } as any);
            }
          }
        }
      }

      if (pullData.settings) {
        let base64Seal: string | undefined = undefined;
        if (pullData.settings.seal_image_path) {
          const fetchedSeal = await api.getSealImageBase64();
          if (fetchedSeal) base64Seal = fetchedSeal;
        }
        await offlineStorage.setSettings(pullData.settings, base64Seal);
      }

      // Re-evaluate pending and conflicts
      const remainingOutbox = await offlineStorage.getPendingOutbox();
      const unresolvedConflicts = await offlineStorage.getConflicts();

      this.currentStatus.pendingCount = remainingOutbox.length;
      this.currentStatus.conflictCount = unresolvedConflicts.length;
      this.currentStatus.lastSyncedAt = new Date();
      this.currentStatus.errorMessage = null;

      if (unresolvedConflicts.length > 0) {
        this.currentStatus.state = 'conflict';
      } else if (remainingOutbox.length > 0) {
        this.currentStatus.state = 'sync-pending';
      } else {
        this.currentStatus.state = 'online-synced';
      }

      this.notify();
    } catch (err: any) {
      console.warn('Sync failed:', err);
      this.currentStatus.state = 'sync-failed';
      this.currentStatus.errorMessage = err?.message || 'Sync failed. Will retry automatically.';
      this.notify();
    } finally {
      this.isSyncing = false;
    }
  }
}

export const syncEngine = new SyncEngine();
