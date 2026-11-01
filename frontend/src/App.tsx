import React, { useState, useEffect } from 'react';
import { Sidebar, PageId } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Billing } from './pages/Billing';
import { Products } from './pages/Products';
import { InvoiceHistory } from './pages/InvoiceHistory';
import { Settings } from './pages/Settings';
import { InvoicePrint } from './printing/InvoicePrint';
import { api, ShopSettings, Invoice } from './services/api';
import { offlineStorage } from './offline/storage';
import { SyncProvider } from './context/SyncContext';
import { SyncStatusBadge } from './components/SyncStatusBadge';
import { Menu } from 'lucide-react';

const AppContent: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [activeInvoiceForPrint, setActiveInvoiceForPrint] = useState<Invoice | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('shop_billing_sidebar_pinned');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const handleTogglePin = () => {
    setIsSidebarPinned(prev => {
      const next = !prev;
      try {
        localStorage.setItem('shop_billing_sidebar_pinned', String(next));
      } catch {}
      return next;
    });
  };

  const fetchSettings = async () => {
    try {
      setIsLoadingSettings(true);
      // Attempt backend API first
      const data = await api.getSettings();
      let sealBase64: string | undefined = undefined;
      const local = await offlineStorage.getSettings();
      if (data.seal_image_path) {
        if (local?.cached_seal_base64) {
          sealBase64 = local.cached_seal_base64;
        } else {
          const b64 = await api.getSealImageBase64();
          if (b64) sealBase64 = b64;
        }
      } else {
        sealBase64 = null as any;
      }
      await offlineStorage.setSettings(data, sealBase64);
      setSettings(sealBase64 ? ({ ...data, cached_seal_base64: sealBase64 } as any) : data);
    } catch (err) {
      console.warn('Failed to fetch settings from server, falling back to local store', err);
      // Fallback to local Dexie store
      const local = await offlineStorage.getSettings();
      if (local) {
        setSettings(local);
      }
    } finally {
      setIsLoadingSettings(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleInvoiceCreated = (invoice: Invoice) => {
    setActiveInvoiceForPrint(invoice);
  };

  const handleOpenInvoice = (invoice: Invoice) => {
    setActiveInvoiceForPrint(invoice);
  };

  const handleSettingsUpdated = (updated: ShopSettings) => {
    setSettings(updated);
    offlineStorage.setSettings(updated, (updated as any).cached_seal_base64);
  };

  return (
    <div className="min-h-screen bg-slate-100/70 flex text-slate-800 antialiased font-sans">
      {/* Fixed Icon Dock + Hover Reveal Sidebar */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        shopName={settings?.shop_name}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        isPinned={isSidebarPinned}
        onTogglePin={handleTogglePin}
      />

      {/* Main Content Area: Automatically adjusts window layout when sidebar is open (260px) or docked (72px) */}
      <div 
        className={`flex-1 flex flex-col min-w-0 overflow-y-auto h-screen transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          isSidebarPinned ? 'lg:pl-[260px]' : 'lg:pl-[72px]'
        } ${activeInvoiceForPrint ? 'print:hidden' : ''}`}
      >
        {/* Top Navbar */}
        <header className="no-print h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
              title="Open Menu"
              aria-label="Open Menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Desktop Pin Toggle Button */}
            <button
              onClick={handleTogglePin}
              className="hidden lg:flex p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
              title={isSidebarPinned ? "Unpin sidebar (hover mode)" : "Pin sidebar"}
              aria-label={isSidebarPinned ? "Unpin sidebar (hover mode)" : "Pin sidebar"}
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-slate-900 tracking-tight truncate max-w-[200px] sm:max-w-md">
                {settings?.shop_name || 'Shop Billing'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Real-time Connectivity & Sync Status Indicator */}
            <SyncStatusBadge />
          </div>
        </header>

        {/* Dynamic Page Views */}
        <main className="p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto flex-1">
          {isLoadingSettings && !settings ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mr-3"></div>
              Loading system configuration...
            </div>
          ) : (
            <>
              {currentPage === 'dashboard' && settings && (
                <Dashboard
                  onNavigate={setCurrentPage}
                  onOpenInvoice={handleOpenInvoice}
                  settings={settings}
                />
              )}
              {currentPage === 'billing' && settings && (
                <Billing
                  settings={settings}
                  onInvoiceCreated={handleInvoiceCreated}
                />
              )}
              {currentPage === 'products' && <Products />}
              {currentPage === 'invoices' && settings && (
                <InvoiceHistory
                  settings={settings}
                  onOpenInvoice={handleOpenInvoice}
                />
              )}
              {currentPage === 'settings' && settings && (
                <Settings
                  settings={settings}
                  onSettingsUpdated={handleSettingsUpdated}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Dedicated Invoice Print & Preview Modal */}
      {activeInvoiceForPrint && settings && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-sm p-2 sm:p-8 flex justify-center items-start print:p-0 print:m-0 print:bg-white print:static print:block print:overflow-visible print:h-auto print:w-full">
          <div className="relative w-full max-w-[210mm] print:w-full print:max-w-none print:m-0 print:static">
            <InvoicePrint
              invoice={activeInvoiceForPrint}
              settings={settings}
              onClose={() => setActiveInvoiceForPrint(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <SyncProvider>
      <AppContent />
    </SyncProvider>
  );
};
