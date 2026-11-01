const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  printInvoice: () => ipcRenderer.invoke('print-invoice'),
  saveBackupFile: (data, defaultFilename) => ipcRenderer.invoke('save-backup', { data, defaultFilename }),
  openBackupFile: () => ipcRenderer.invoke('open-backup'),
});
