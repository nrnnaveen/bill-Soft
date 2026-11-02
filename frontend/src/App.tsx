import React, { useState, useEffect } from 'react';
import { Sidebar, PageId } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Billing } from './pages/Billing';
import { Products } from './pages/Products';
import { InvoiceHistory } from './pages/InvoiceHistory';
import { Settings } from './pages/Settings';
import { InvoicePrint } from './printing/InvoicePrint';
import { api, ShopSettings, Invoice, DEFAULT_SHOP_SETTINGS } from './services/api';
import { offlineStorage } from './offline/storage';
import { SyncProvider } from './context/SyncContext';
import { SyncStatusBadge } from './components/SyncStatusBadge';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Menu } from 'lucide-react';

const PAGE_TITLES: Record<PageId, string> = {
  dashboard: 'Dashboard',
  billing: 'Create Bill',
  products: 'Products & Inventory',
  invoices: 'Invoice History',
  settings: 'Shop Settings',
};

const AppContent: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SHOP_SETTINGS);
  const [activeInvoiceForPrint, setActiveInvoiceForPrint] = useState<Invoice | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('shop_billing_sidebar_open');
      if (saved !== null) {
        return saved === 'true';
      }
      return typeof window !== 'undefined' ? window.innerWidth >= 1024 : true;
    } catch {
      return true;
    }
  });

  const handleToggleSidebar = () => {
    setIsSidebarOpen(prev => {
      const next = !prev;
      try {
        localStorage.setItem('shop_billing_sidebar_open', String(next));
      } catch {}
      return next;
    });
  };

  const fetchSettings = async () => {
    // 1. Immediate instant hydration from local offline storage
    try {
      const local = await offlineStorage.getSettings();
      if (local && local.shop_name) {
        setSettings(local);
      }
    } catch (e) {
      console.warn('Could not read offline settings:', e);
    }

    // 2. Fetch latest settings from server
    try {
      const data = await api.getSettings();
      if (data && data.shop_name) {
        let sealBase64: string | undefined = undefined;
        const local = await offlineStorage.getSettings();
        if (data.seal_image_path) {
          if (local?.cached_seal_base64) {
            sealBase64 = local.cached_seal_base64;
          } else {
            const b64 = await api.getSealImageBase64();
            if (b64) sealBase64 = b64;
          }
        }
        await offlineStorage.setSettings(data, sealBase64);
        setSettings(sealBase64 ? ({ ...data, cached_seal_base64: sealBase64 } as any) : data);
      }
    } catch (err) {
      console.warn('Network error fetching settings from server, using local store', err);
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
      {/* Synchronized Sidebar Navigation */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        shopName={settings?.shop_name}
        isOpen={isSidebarOpen}
        onToggle={handleToggleSidebar}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Area: Synchronized with sidebar width so the window fluidly adjusts without any content overlap */}
      <div 
        className={`flex-1 flex flex-col min-w-0 overflow-y-auto h-screen transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          isSidebarOpen ? 'lg:pl-[260px]' : 'lg:pl-[72px]'
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

            {/* Desktop Menu Toggle Button */}
            <button
              onClick={handleToggleSidebar}
              className="hidden lg:flex p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
              title={isSidebarOpen ? "Collapse sidebar (72px dock)" : "Expand sidebar (260px)"}
              aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5">
              <span className="text-base font-bold text-slate-900 tracking-tight">
                {PAGE_TITLES[currentPage]}
              </span>
              <span className="hidden sm:inline-block text-slate-300 font-normal">|</span>
              <span className="hidden sm:inline-block text-xs text-slate-500 font-medium truncate max-w-xs md:max-w-md">
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
          <ErrorBoundary>
            {currentPage === 'dashboard' && (
              <Dashboard
                onNavigate={setCurrentPage}
                onOpenInvoice={handleOpenInvoice}
                settings={settings}
              />
            )}
            {currentPage === 'billing' && (
              <Billing
                settings={settings}
                onInvoiceCreated={handleInvoiceCreated}
              />
            )}
            {currentPage === 'products' && <Products />}
            {currentPage === 'invoices' && (
              <InvoiceHistory
                settings={settings}
                onOpenInvoice={handleOpenInvoice}
              />
            )}
            {currentPage === 'settings' && (
              <Settings
                settings={settings}
                onSettingsUpdated={handleSettingsUpdated}
              />
            )}
          </ErrorBoundary>
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
