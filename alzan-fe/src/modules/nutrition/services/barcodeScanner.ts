export const BARCODE_CONFIRMATION_WINDOW_MS = 800;

export type SupportedBarcodeType = 'ean13' | 'ean8' | 'upc_a' | 'upc_e';

export type BarcodeDetectionState = {
  barcode: string | null;
  matches: number;
  timestamp: number;
};

type BarcodeDetection = {
  rawType: string;
  rawData: string;
  timestamp: number;
};

type BarcodeDetectionResult = {
  state: BarcodeDetectionState;
  confirmedBarcode: string | null;
};

type CameraPermissionState = {
  granted: boolean;
  canAskAgain: boolean;
};

type ScannerViewport = {
  width: number;
  height: number;
};

export type WebCameraVideoConstraints = {
  width: { ideal: number };
  height: { ideal: number };
  facingMode?: { ideal: 'environment' };
};

export function getScannerFrameSize({ width, height }: ScannerViewport): number {
  const safeWidth = Math.max(0, width);
  const safeHeight = Math.max(0, height);
  return Math.round(Math.min(safeWidth * 0.72, safeHeight * 0.55, 520));
}

export function shouldPreferEnvironmentCamera(hasCoarsePointer: boolean, maxTouchPoints: number): boolean {
  return hasCoarsePointer || maxTouchPoints > 1;
}

export function getWebCameraConstraints(preferEnvironmentCamera: boolean): WebCameraVideoConstraints {
  return {
    width: { ideal: 1_280 },
    height: { ideal: 720 },
    ...(preferEnvironmentCamera ? { facingMode: { ideal: 'environment' as const } } : {}),
  };
}

export function shouldRequestCameraPermissionOnScannerOpen(
  permission: CameraPermissionState | null,
  alreadyRequested: boolean,
): boolean {
  return Boolean(permission && !permission.granted && permission.canAskAgain && !alreadyRequested);
}

export function createBarcodeDetectionState(): BarcodeDetectionState {
  return {
    barcode: null,
    matches: 0,
    timestamp: 0,
  };
}

function normalizeBarcode(value: string): string {
  return value.replace(/\s+/g, '').trim();
}

function normalizeBarcodeType(value: string): SupportedBarcodeType | null {
  const normalized = value.toLowerCase().replace(/[-_\s]/g, '');
  if (normalized === 'ean13') return 'ean13';
  if (normalized === 'ean8') return 'ean8';
  if (normalized === 'upca') return 'upc_a';
  if (normalized === 'upce') return 'upc_e';
  return null;
}

function isValidBarcodeForType(type: SupportedBarcodeType, barcode: string): boolean {
  if (!/^\d+$/.test(barcode)) {
    return false;
  }

  switch (type) {
    case 'ean13':
      return barcode.length === 13;
    case 'ean8':
      return barcode.length === 8;
    case 'upc_a':
      return barcode.length === 12;
    case 'upc_e':
      return barcode.length >= 6 && barcode.length <= 8;
  }
}

export function registerBarcodeDetection(
  state: BarcodeDetectionState,
  detection: BarcodeDetection,
): BarcodeDetectionResult {
  const type = normalizeBarcodeType(detection.rawType);
  const barcode = normalizeBarcode(detection.rawData);
  if (!type || !isValidBarcodeForType(type, barcode)) {
    return { state, confirmedBarcode: null };
  }

  const isRepeatedDetection =
    state.barcode === barcode && detection.timestamp - state.timestamp <= BARCODE_CONFIRMATION_WINDOW_MS;
  const matches = isRepeatedDetection ? state.matches + 1 : 1;
  const nextState = {
    barcode,
    matches,
    timestamp: detection.timestamp,
  };

  return {
    state: nextState,
    confirmedBarcode: matches >= 2 ? barcode : null,
  };
}

export async function resolveWebBarcodeDetectorConstructor<T>(
  nativeConstructor: T | undefined,
  loadFallback: () => Promise<T>,
): Promise<T> {
  return nativeConstructor ?? loadFallback();
}
