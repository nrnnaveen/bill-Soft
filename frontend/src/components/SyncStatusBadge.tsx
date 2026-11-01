import React, { useState } from 'react';
import { useSync } from '../context/SyncContext';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ConflictModal } from './ConflictModal';

export const SyncStatusBadge: React.FC = () => {
  const { state, isOnline, pendingCount, conflictCount, triggerSync } = useSync();
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);

  const handleManualSync = async () => {
    setIsSpinning(true);
    await triggerSync();
    setTimeout(() => setIsSpinning(false), 500);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {state === 'online-synced' && (
          <button
            onClick={handleManualSync}
            title="Online and fully synchronized with database. Click to refresh."
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors shadow-sm"
          >
            <CheckCircle2 className={`w-3.5 h-3.5 text-emerald-600 ${isSpinning ? 'animate-spin' : ''}`} />
            <span>Online &amp; Synced</span>
          </button>
        )}

        {state === 'offline' && (
          <div
            title="Operating offline. Bills and stock are saved safely in device storage."
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 shadow-sm"
          >
            <WifiOff className="w-3.5 h-3.5 text-amber-600" />
            <span>Offline (Local Store)</span>
          </div>
        )}

        {state === 'sync-pending' && (
          <button
            onClick={handleManualSync}
            title={`${pendingCount} operation(s) waiting to upload.`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
            <span>Syncing ({pendingCount} pending)</span>
          </button>
        )}

        {state === 'sync-failed' && (
          <button
            onClick={handleManualSync}
            title="Last synchronization attempt failed. Click to retry now."
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors shadow-sm"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            <span>Sync Failed (Retry)</span>
          </button>
        )}

        {state === 'conflict' && (
          <button
            onClick={() => setIsConflictModalOpen(true)}
            title="Concurrent multi-device sales resulted in stock conflicts. Click to review."
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm animate-pulse"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-white" />
            <span>{conflictCount} Conflict{conflictCount > 1 ? 's' : ''} (Review)</span>
          </button>
        )}
      </div>

      {isConflictModalOpen && (
        <ConflictModal onClose={() => setIsConflictModalOpen(false)} />
      )}
    </>
  );
};
