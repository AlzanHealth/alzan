import assert from 'node:assert/strict';
import {
  createBarcodeDetectionState,
  extractProductCodeFromQr,
  getScannerFrameSize,
  getWebCameraConstraints,
  normalizeProductLookupCode,
  registerBarcodeDetection,
  resolveWebBarcodeDetectorConstructor,
  shouldPreferEnvironmentCamera,
  shouldRequestCameraPermissionOnScannerOpen,
  stopWebCamera,
} from './barcodeScanner';

assert.equal(shouldRequestCameraPermissionOnScannerOpen(null, false), false);
assert.equal(shouldRequestCameraPermissionOnScannerOpen({ granted: true, canAskAgain: true }, false), false);
assert.equal(shouldRequestCameraPermissionOnScannerOpen({ granted: false, canAskAgain: true }, false), true);
assert.equal(shouldRequestCameraPermissionOnScannerOpen({ granted: false, canAskAgain: true }, true), false);
assert.equal(shouldRequestCameraPermissionOnScannerOpen({ granted: false, canAskAgain: false }, false), false);

assert.equal(getScannerFrameSize({ width: 1_900, height: 1_180 }), 520);
assert.equal(getScannerFrameSize({ width: 390, height: 844 }), 281);
assert.equal(getScannerFrameSize({ width: 844, height: 390 }), 215);

assert.equal(shouldPreferEnvironmentCamera(false, 0), false);
assert.equal(shouldPreferEnvironmentCamera(true, 0), true);
assert.equal(shouldPreferEnvironmentCamera(false, 5), true);

assert.deepEqual(getWebCameraConstraints(false), {
  width: { ideal: 1_280 },
  height: { ideal: 720 },
});
assert.deepEqual(getWebCameraConstraints(true), {
  width: { ideal: 1_280 },
  height: { ideal: 720 },
  facingMode: { ideal: 'environment' },
});

assert.deepEqual(createBarcodeDetectionState(), {
  barcode: null,
  matches: 0,
  timestamp: 0,
});

const firstDetection = registerBarcodeDetection(createBarcodeDetectionState(), {
  rawType: 'ean_13',
  rawData: ' 8410 1234 5678 3 ',
  timestamp: 1_000,
});
assert.equal(firstDetection.confirmedBarcode, null);
assert.deepEqual(firstDetection.state, {
  barcode: '8410123456783',
  matches: 1,
  timestamp: 1_000,
});

const confirmedDetection = registerBarcodeDetection(firstDetection.state, {
  rawType: 'EAN-13',
  rawData: '8410123456783',
  timestamp: 1_500,
});
assert.equal(confirmedDetection.confirmedBarcode, '8410123456783');
assert.equal(confirmedDetection.state.matches, 2);

const expiredDetection = registerBarcodeDetection(firstDetection.state, {
  rawType: 'ean13',
  rawData: '8410123456783',
  timestamp: 1_801,
});
assert.equal(expiredDetection.confirmedBarcode, null);
assert.equal(expiredDetection.state.matches, 1);

assert.equal(extractProductCodeFromQr('231626003623'), '231626003623');
assert.equal(extractProductCodeFromQr('(01)08412345678901(10)LOT123'), '08412345678901');
assert.equal(extractProductCodeFromQr('https://example.com/product?gtin=08412345678901'), '08412345678901');
assert.equal(extractProductCodeFromQr('https://example.com/lot/L521888'), null);
assert.equal(normalizeProductLookupCode(' 8410 1234 5678 3 '), '8410123456783');
assert.equal(normalizeProductLookupCode('https://example.com/product?gtin=08412345678901'), '08412345678901');
assert.equal(normalizeProductLookupCode('https://example.com/lot/L521888'), null);

const firstQrDetection = registerBarcodeDetection(createBarcodeDetectionState(), {
  rawType: 'qr_code',
  rawData: '(01)08412345678901(10)LOT123',
  timestamp: 4_000,
});
assert.equal(firstQrDetection.confirmedBarcode, null);
assert.equal(firstQrDetection.state.barcode, '08412345678901');

const confirmedQrDetection = registerBarcodeDetection(firstQrDetection.state, {
  rawType: 'qr',
  rawData: '08412345678901',
  timestamp: 4_500,
});
assert.equal(confirmedQrDetection.confirmedBarcode, '08412345678901');

const unknownQrDetection = registerBarcodeDetection(createBarcodeDetectionState(), {
  rawType: 'qr_code',
  rawData: 'https://example.com/lot/L521888',
  timestamp: 5_000,
});
const confirmedUnknownQr = registerBarcodeDetection(unknownQrDetection.state, {
  rawType: 'qr_code',
  rawData: 'https://example.com/lot/L521888',
  timestamp: 5_500,
});
assert.equal(confirmedUnknownQr.confirmedBarcode, 'https://example.com/lot/L521888');
assert.equal(normalizeProductLookupCode(confirmedUnknownQr.confirmedBarcode), null);

const stoppedTracks: string[] = [];
const stream = {
  getTracks: () => [{ stop: () => stoppedTracks.push('first') }, { stop: () => stoppedTracks.push('second') }],
};
const video = { srcObject: stream };
stopWebCamera(stream, video);
stopWebCamera(null, video);
assert.deepEqual(stoppedTracks, ['first', 'second']);
assert.equal(video.srcObject, null);

for (const [rawType, barcode] of [
  ['ean8', '12345678'],
  ['upc_a', '123456789012'],
  ['UPC-E', '1234567'],
] as const) {
  const detection = registerBarcodeDetection(createBarcodeDetectionState(), {
    rawType,
    rawData: barcode,
    timestamp: 2_000,
  });
  assert.equal(detection.state.barcode, barcode);
}

for (const [rawType, barcode] of [
  ['ean13', '123'],
  ['ean8', 'abcdefgh'],
  ['upc_a', '12345678901'],
] as const) {
  const detection = registerBarcodeDetection(createBarcodeDetectionState(), {
    rawType,
    rawData: barcode,
    timestamp: 3_000,
  });
  assert.equal(detection.state.barcode, null);
  assert.equal(detection.confirmedBarcode, null);
}

class NativeDetector {
  detect = async () => [];
}

class FallbackDetector {
  detect = async () => [];
}

async function verifyDetectorResolution() {
  let fallbackLoads = 0;
  assert.equal(
    await resolveWebBarcodeDetectorConstructor(NativeDetector, async () => {
      fallbackLoads += 1;
      return FallbackDetector;
    }),
    NativeDetector,
  );
  assert.equal(fallbackLoads, 0);

  assert.equal(
    await resolveWebBarcodeDetectorConstructor(undefined, async () => {
      fallbackLoads += 1;
      return FallbackDetector;
    }),
    FallbackDetector,
  );
  assert.equal(fallbackLoads, 1);
}

void verifyDetectorResolution()
  .then(() => {
    console.log('barcodeScanner.spec.ts: all assertions passed');
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
