interface ElectronBridge {
  onOpenSettings(cb: () => void): () => void;
  onUpdateAvailable(cb: () => void): () => void;
  hasPendingUpdate(): Promise<boolean>;
  installUpdate(): Promise<void>;
}

interface Window {
  electron?: ElectronBridge;
}
