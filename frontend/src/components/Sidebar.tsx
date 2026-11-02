import React, { useEffect } from 'react';
import { 
  LayoutDashboard, 
  Receipt, 
  Package, 
  History, 
  Settings as SettingsIcon,
  Store,
  X,
  PanelLeftClose,
  Menu
} from 'lucide-react';

export type PageId = 'dashboard' | 'billing' | 'products' | 'invoices' | 'settings';

export interface SidebarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  shopName?: string;
  isOpen?: boolean;
  onToggle?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  // Backward compatibility
  isPinned?: boolean;
  onTogglePin?: () => void;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentPage, 
  onNavigate, 
  shopName,
  isOpen,
  onToggle,
  isMobileOpen,
  onCloseMobile,
  isPinned,
  onTogglePin,
  onClose,
}) => {
  // Normalize mobile open state
  const mobileOpen = isMobileOpen ?? false;
  const handleCloseMobile = onCloseMobile ?? onClose ?? (() => {});

  // Desktop open state: synchronized directly with App layout padding
  const isDesktopOpen = isOpen ?? isPinned ?? true;
  const handleToggle = onToggle ?? onTogglePin ?? (() => {});

  // Effective expanded state: on mobile if drawer is open, on desktop if sidebar is open
  const isExpanded = mobileOpen || isDesktopOpen;

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [mobileOpen]);

  // Handle Escape key to close mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileOpen) {
        handleCloseMobile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, handleCloseMobile]);

  const navItems = [
    {
      id: 'dashboard' as PageId,
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      id: 'billing' as PageId,
      label: 'Create Bill',
      icon: Receipt,
    },
    {
      id: 'products' as PageId,
      label: 'Products',
      icon: Package,
    },
    {
      id: 'invoices' as PageId,
      label: 'Invoice History',
      icon: History,
    },
    {
      id: 'settings' as PageId,
      label: 'Settings',
      icon: SettingsIcon,
    },
  ];

  const handleItemClick = (id: PageId) => {
    onNavigate(id);
    if (window.innerWidth < 1024) {
      handleCloseMobile();
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div 
          onClick={handleCloseMobile} 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-xs transition-opacity duration-200"
          aria-hidden="true"
        />
      )}

      {/* 
        Synchronized Sidebar:
        - Mobile: Off-canvas drawer (z-50) sliding in/out
        - Desktop: Fixed navigation dock synchronized with main content padding
          * Open: 260px (Main window lg:pl-[260px])
          * Closed: 72px (Main window lg:pl-[72px])
          * Result: The window fluidly adjusts without any content overlap or UI break!
      */}
      <aside 
        aria-label="Main Navigation"
        className={`no-print bg-white border-r border-slate-200 flex flex-col h-screen select-none fixed top-0 left-0 z-40 transition-[width,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none overflow-visible ${
          mobileOpen
            ? 'translate-x-0 w-[260px] shadow-2xl shadow-slate-900/20 z-50'
            : '-translate-x-full lg:translate-x-0'
        } ${
          isDesktopOpen
            ? 'lg:w-[260px] lg:shadow-none'
            : 'lg:w-[72px] lg:shadow-none'
        }`}
      >
        <div className="w-full flex flex-col h-full overflow-hidden">
          {/* Brand Header (h-16 aligns with top navbar) */}
          <div className="h-16 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 text-white flex items-center px-2 relative flex-shrink-0">
            {/* Centered Brand Icon Wrapper (56px wide, perfectly centered in 72px dock: 8px + 28px = 36px) */}
            <div className="w-[56px] h-full flex items-center justify-center flex-shrink-0">
              <button
                type="button"
                onClick={handleToggle}
                className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-emerald-400 flex items-center justify-center font-bold text-lg text-white shadow-md shadow-indigo-900/50 flex-shrink-0 hover:scale-105 active:scale-95 transition-transform"
                title={isDesktopOpen ? (shopName || 'Shop Billing') : 'Expand sidebar'}
                aria-label={isDesktopOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              >
                <Store className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Expanded Brand Name & Subtitle */}
            <div 
              className={`ml-1 flex-1 flex flex-col justify-center overflow-hidden whitespace-nowrap transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${
                isExpanded
                  ? 'opacity-100 translate-x-0'
                  : 'opacity-0 -translate-x-2 pointer-events-none'
              }`}
            >
              <h1 className="font-bold text-sm tracking-wide text-white truncate max-w-[135px]">
                {shopName ? (shopName.length > 18 ? shopName.slice(0, 16) + '...' : shopName) : 'Shop Billing'}
              </h1>
              <p className="text-[11px] text-indigo-300 font-medium flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Shop &amp; Inventory
              </p>
            </div>

            {/* Desktop Collapse Toggle Button */}
            <button 
              type="button"
              onClick={handleToggle}
              className={`hidden lg:flex p-1.5 rounded-lg transition-colors ml-auto mr-1 text-slate-400 hover:text-white hover:bg-white/10 ${
                isDesktopOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4 text-slate-300 hover:text-white" />
            </button>

            {/* Mobile Close Button */}
            <button 
              type="button"
              onClick={handleCloseMobile}
              className="lg:hidden p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors ml-auto mr-1"
              title="Close menu"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links List */}
          <nav 
            className="flex-1 p-2 space-y-1.5 overflow-y-auto overflow-x-hidden select-none"
            aria-label="Primary"
          >
            {/* Subtle Menu Category Header in Expanded State */}
            <div 
              className={`px-3 py-1.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase whitespace-nowrap transition-all duration-200 ${
                isExpanded
                  ? 'opacity-100 h-auto'
                  : 'opacity-0 h-2 pointer-events-none'
              }`}
            >
              Menu
            </div>

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;

              return (
                <div key={item.id} className="relative group">
                  <button
                    onClick={() => handleItemClick(item.id)}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full h-11 flex items-center rounded-xl relative transition-colors duration-150 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 ${
                      isActive
                        ? 'bg-indigo-50/90 text-indigo-950 font-semibold shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                    }`}
                  >
                    {/* Active Accent Bar on Left Border */}
                    {isActive && (
                      <span 
                        className="absolute -left-2 top-2 bottom-2 w-1 rounded-r-full bg-indigo-600 shadow-xs" 
                        aria-hidden="true"
                      />
                    )}

                    {/* Centered Icon Container (56px wide, perfectly centered at 36px in 72px dock) */}
                    <div className="w-[56px] h-full flex items-center justify-center flex-shrink-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 ${
                          isActive 
                            ? 'bg-indigo-600 text-white shadow-xs' 
                            : 'text-slate-600 group-hover:text-indigo-600 group-hover:bg-white'
                        }`}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                      </div>
                    </div>

                    {/* Navigation Label (smooth fade & slide) */}
                    <div 
                      className={`ml-1 flex-1 flex items-center justify-between overflow-hidden whitespace-nowrap transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${
                        isExpanded
                          ? 'opacity-100 translate-x-0'
                          : 'opacity-0 -translate-x-2 pointer-events-none'
                      }`}
                    >
                      <span className={`text-sm tracking-tight ${isActive ? 'font-semibold text-indigo-950' : 'font-medium text-slate-700 group-hover:text-slate-900'}`}>
                        {item.label}
                      </span>
                    </div>
                  </button>

                  {/* 
                    Helpful Tooltip on Hover in Collapsed Desktop State
                    Shown only when collapsed, anchored outside dock at left-[76px]
                  */}
                  {!isExpanded && (
                    <div 
                      role="tooltip"
                      className="hidden lg:flex items-center absolute left-[76px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl shadow-slate-900/25 whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150"
                    >
                      <span>{item.label}</span>
                      <span 
                        className="absolute -left-1 top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" 
                        aria-hidden="true"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* System Version Footer */}
          <div className="h-14 border-t border-slate-100 bg-slate-50/70 flex items-center px-2 flex-shrink-0">
            {/* Centered Online Status Dot in Collapsed State */}
            <div 
              className="w-[56px] h-full flex items-center justify-center flex-shrink-0"
              title="Shop Billing v1.0 • System Ready"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
            </div>

            {/* Expanded Footer Details */}
            <div 
              className={`ml-1 flex-1 flex items-center justify-between overflow-hidden whitespace-nowrap transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${
                isExpanded
                  ? 'opacity-100 translate-x-0'
                  : 'opacity-0 -translate-x-2 pointer-events-none'
              }`}
            >
              <span className="font-semibold text-xs text-slate-700">Shop Billing</span>
              <span className="text-[11px] text-slate-400 font-mono font-medium mr-2">v1.0</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
