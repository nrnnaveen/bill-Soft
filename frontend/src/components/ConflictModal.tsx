import React, { useEffect, useState } from 'react';
import { offlineStorage } from '../offline/storage';
import { OfflineConflict } from '../offline/db';
import { AlertTriangle, Check, X } from 'lucide-react';
import { useSync } from '../context/SyncContext';

interface ConflictModalProps {
  onClose: () => void;
}

export const ConflictModal: React.FC<ConflictModalProps> = ({ onClose }) => {
  const [conflicts, setConflicts] = useState<OfflineConflict[]>([]);
  const { triggerSync } = useSync();

  const loadConflicts = async () => {
    const list = await offlineStorage.getConflicts();
    setConflicts(list);
  };

  useEffect(() => {
    loadConflicts();
  }, []);

  const handleResolve = async (id: number) => {
    await offlineStorage.resolveConflict(id);
    await loadConflicts();
    await triggerSync();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Multi-Device Synchronization Conflicts</h3>
              <p className="text-xs text-slate-500">
                Discrepancies identified when concurrent offline sales were synchronized with the database.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {conflicts.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="font-semibold text-slate-800">All conflicts resolved!</p>
              <p className="text-xs text-slate-500 mt-1">Stock balances and invoices are reconciled.</p>
            </div>
          ) : (
            conflicts.map(conflict => (
              <div
                key={conflict.id}
                className="p-4 rounded-xl border border-amber-200 bg-amber-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-amber-200 text-amber-900">
                      {conflict.conflict_type}
                    </span>
                    <span className="font-bold text-slate-900 text-sm">{conflict.title}</span>
                  </div>
                  <p className="text-slate-700 leading-relaxed">{conflict.details}</p>
                  {(conflict.client_value || conflict.server_value) && (
                    <div className="flex gap-4 pt-1 font-mono text-[11px] text-slate-600">
                      {conflict.client_value && <span>Client: <strong>{conflict.client_value}</strong></span>}
                      {conflict.server_value && <span>Server: <strong>{conflict.server_value}</strong></span>}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => conflict.id && handleResolve(conflict.id)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all self-end sm:self-center"
                >
                  <Check className="w-3.5 h-3.5" /> Acknowledge &amp; Clear
                </button>
              </div>
            ))
          )}
        </div>

        <div className="pt-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
