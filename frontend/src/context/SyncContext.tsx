import React, { createContext, useContext, useEffect, useState } from 'react';
import { syncEngine, SyncEngineStatus, SyncState } from '../sync/syncEngine';

interface SyncContextValue extends SyncEngineStatus {
  triggerSync: () => Promise<void>;
  deviceId: string;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<SyncEngineStatus>(syncEngine.getStatus());

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe(newStatus => {
      setStatus(newStatus);
    });
    return unsubscribe;
  }, []);

  return (
    <SyncContext.Provider
      value={{
        ...status,
        triggerSync: () => syncEngine.syncNow(),
        deviceId: syncEngine.getDeviceId(),
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
};
