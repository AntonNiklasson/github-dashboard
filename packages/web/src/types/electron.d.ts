interface ElectronBridge {
  onOpenSettings(cb: () => void): () => void;
}

interface Window {
  electron?: ElectronBridge;
}
