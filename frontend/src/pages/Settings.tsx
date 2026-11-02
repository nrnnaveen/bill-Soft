import React, { useState, useRef } from 'react';
import { api, ShopSettings } from '../services/api';
import { offlineStorage } from '../offline/storage';
import { syncEngine } from '../sync/syncEngine';
import { 
  Settings as SettingsIcon, 
  Upload, 
  Trash2, 
  Save, 
  CheckCircle2, 
  AlertCircle, 
  Building,
  Image,
  RefreshCw,
  Smartphone,
  Info
} from 'lucide-react';

interface SettingsProps {
  settings: ShopSettings;
  onSettingsUpdated: (updated: ShopSettings) => void;
}

export const Settings: React.FC<SettingsProps> = ({ settings, onSettingsUpdated }) => {
  const [formData, setFormData] = useState<Partial<ShopSettings>>({
    shop_name: settings.shop_name,
    address: settings.address,
    gstin: settings.gstin || '',
    email: settings.email || '',
    contact_no: settings.contact_no || '',
    state: settings.state,
    state_code: settings.state_code,
    invoice_prefix: settings.invoice_prefix,
    device_invoice_prefix: settings.device_invoice_prefix || 'INV-DEV1-',
    next_invoice_number: settings.next_invoice_number,
    default_terms: settings.default_terms,
    default_is_gst: settings.default_is_gst,
  });

  const [sealFile, setSealFile] = useState<File | null>(null);
  const [sealPreviewUrl, setSealPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingSeal, setIsUploadingSeal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync formData whenever settings prop updates
  React.useEffect(() => {
    if (settings) {
      setFormData({
        shop_name: settings.shop_name,
        address: settings.address,
        gstin: settings.gstin || '',
        email: settings.email || '',
        contact_no: settings.contact_no || '',
        state: settings.state,
        state_code: settings.state_code,
        invoice_prefix: settings.invoice_prefix,
        device_invoice_prefix: settings.device_invoice_prefix || 'INV-DEV1-',
        next_invoice_number: settings.next_invoice_number,
        default_terms: settings.default_terms,
        default_is_gst: settings.default_is_gst,
      });
    }
  }, [settings]);

  // Handle local seal selection for preview
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      setErrorMessage('Please select a PNG or JPEG image file.');
      return;
    }

    setSealFile(file);
    const objectUrl = URL.createObjectURL(file);
    setSealPreviewUrl(objectUrl);
    setErrorMessage(null);
  };

  // Upload the selected seal
  const handleUploadSeal = async () => {
    if (!sealFile) return;

    try {
      setIsUploadingSeal(true);
      setErrorMessage(null);
      const updated = await api.uploadSeal(sealFile);
      const b64 = await api.getSealImageBase64();
      await offlineStorage.setSettings(updated, b64 || undefined);
      onSettingsUpdated(b64 ? ({ ...updated, cached_seal_base64: b64 } as any) : updated);
      setSealFile(null);
      setSealPreviewUrl(null);
      setSuccessMessage('Authorized seal image uploaded and saved persistently in cloud storage & offline cache!');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.detail || 'Failed to upload authorized seal image.');
    } finally {
      setIsUploadingSeal(false);
    }
  };

  // Delete seal image
  const handleDeleteSeal = async () => {
    if (!confirm('Are you sure you want to remove the authorized seal? Invoices will have a blank signature area.')) {
      return;
    }

    try {
      setIsUploadingSeal(true);
      setErrorMessage(null);
      const updated = await api.deleteSeal();
      await offlineStorage.setSettings(updated, null);
      onSettingsUpdated({ ...updated, cached_seal_base64: null } as any);
      setSealFile(null);
      setSealPreviewUrl(null);
      setSuccessMessage('Authorized seal removed. Seal area will remain blank on invoices.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.detail || 'Failed to delete seal.');
    } finally {
      setIsUploadingSeal(false);
    }
  };

  // Save textual settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setErrorMessage(null);
      const updated = await api.updateSettings(formData);
      onSettingsUpdated(updated);
      setSuccessMessage('Shop settings and billing preferences saved successfully!');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.detail || 'Failed to update shop settings.');
    } finally {
      setIsSaving(false);
    }
  };


  const handleManualSyncNow = async () => {
    try {
      setIsSyncing(true);
      await syncEngine.syncNow();
      setSuccessMessage('Synchronization with server completed!');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage('Sync failed: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 text-purple-600" /> Settings
          </h2>
        </div>

        <button
          onClick={handleManualSyncNow}
          disabled={isSyncing}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Syncing...' : 'Sync Server Now'}</span>
        </button>
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-800 text-sm shadow-xs animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-800 text-sm shadow-xs animate-in fade-in">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600" />
          <span className="font-medium">{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Section 1: Shop Details */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <Building className="w-4 h-4 text-indigo-600" /> Shop Details
            </h3>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Shop / Society Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.shop_name}
              onChange={e => setFormData({ ...formData, shop_name: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Complete Shop Address <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={2}
              required
              value={formData.address}
              onChange={e => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs leading-relaxed focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Shop GSTIN
              </label>
              <input
                type="text"
                value={formData.gstin || ''}
                onChange={e => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                placeholder="e.g. 33AAKAK0961H1ZP"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contact Phone Number
              </label>
              <input
                type="text"
                value={formData.contact_no || ''}
                onChange={e => setFormData({ ...formData, contact_no: e.target.value })}
                placeholder="e.g. 8015913892"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Shop Email Address
              </label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="shop@example.com"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Supplier State (Place of Supply)
              </label>
              <input
                type="text"
                value={formData.state}
                onChange={e => setFormData({ ...formData, state: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                State Code
              </label>
              <input
                type="text"
                value={formData.state_code}
                onChange={e => setFormData({ ...formData, state_code: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Invoice Numbering */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h3 className="font-bold text-base text-slate-900 border-b border-slate-100 pb-3">
            Invoice Numbering
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Server Invoice Prefix
              </label>
              <input
                type="text"
                value={formData.invoice_prefix}
                onChange={e => setFormData({ ...formData, invoice_prefix: e.target.value })}
                placeholder="INV-"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Smartphone className="w-3.5 h-3.5 text-indigo-600" /> Device Offline Prefix
              </label>
              <input
                type="text"
                value={formData.device_invoice_prefix}
                onChange={e => setFormData({ ...formData, device_invoice_prefix: e.target.value })}
                placeholder="INV-DEV1-"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Next Sequence Number
              </label>
              <input
                type="number"
                min="1"
                value={formData.next_invoice_number}
                onChange={e => setFormData({ ...formData, next_invoice_number: Number(e.target.value) })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Statutory Advice Box */}
          <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">Indian GST Rule 46(b) Notice:</span>
              <p className="leading-relaxed text-[11px] text-amber-800">
                Under GST rules, tax invoice numbers must be consecutive and unique for a financial year across all billing counters. 
                Configuring unique terminal prefixes (e.g. <code>REG1-</code>, <code>MOB1-</code>, <code>DEV1-</code>) avoids numbering collisions during offline operations. 
                Please verify your numbering scheme with your Chartered Accountant / Tax Advisor.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Standard Terms &amp; Conditions (Printed on bottom of invoice)
            </label>
            <textarea
              rows={4}
              value={formData.default_terms}
              onChange={e => setFormData({ ...formData, default_terms: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono leading-relaxed focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-md shadow-indigo-200 active:scale-95 transition-all"
            >
              <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </form>

      {/* Section 3: Authorized Seal */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
            <Image className="w-4 h-4 text-emerald-600" /> Authorized Seal
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Current Seal Preview (5 cols) */}
          <div className="md:col-span-5 flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 min-h-[180px]">
            {sealPreviewUrl ? (
              <div className="text-center">
                <img
                  src={sealPreviewUrl}
                  alt="New Seal Preview"
                  className="max-h-28 max-w-44 object-contain mx-auto mb-2 shadow-xs rounded-lg"
                />
                <span className="text-[11px] font-semibold text-indigo-600">Selected (Pending Upload)</span>
              </div>
            ) : (settings as any).cached_seal_base64 || settings.seal_image_path ? (
              <div className="text-center">
                <img
                  src={(settings as any).cached_seal_base64 || api.getSealImageUrl()}
                  alt="Authorized Seal"
                  className="max-h-28 max-w-44 object-contain mx-auto mb-2 mix-blend-multiply"
                />
                <span className="text-[11px] font-semibold text-emerald-700">Active Authorized Seal</span>
              </div>
            ) : (
              <div className="text-center text-slate-400">
                <Image className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <span className="text-xs font-medium">No seal uploaded yet</span>
              </div>
            )}
          </div>

          {/* Upload Controls (7 cols) */}
          <div className="md:col-span-7 space-y-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
            />

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-xs transition-all"
              >
                <Upload className="w-4 h-4 text-indigo-600" />
                {settings.seal_image_path ? 'Choose Replacement Seal' : 'Select Seal File (PNG/JPEG)'}
              </button>

              {sealFile && (
                <button
                  type="button"
                  disabled={isUploadingSeal}
                  onClick={handleUploadSeal}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-md shadow-emerald-200 transition-all active:scale-95"
                >
                  <Save className="w-4 h-4" />
                  {isUploadingSeal ? 'Uploading...' : 'Confirm & Save Seal'}
                </button>
              )}

              {settings.seal_image_path && (
                <button
                  type="button"
                  disabled={isUploadingSeal}
                  onClick={handleDeleteSeal}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-semibold text-xs transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Remove Seal
                </button>
              )}
            </div>

            <div className="text-[11px] text-slate-500 space-y-1 pt-1">
              <p>• Supported formats: PNG, JPG/JPEG, WebP (under 5MB).</p>
              <p>• Seal automatically retains correct aspect ratio inside the designated A4 print area.</p>
              <p>• Automatically cached locally for offline bill printing.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
