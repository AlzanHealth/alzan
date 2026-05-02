// src/modules/nutrition/components/FoodScanner.tsx
// Barcode scanner component using expo-camera

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { X, Flashlight, FlashlightOff, ScanBarcode } from 'lucide-react-native';
import { warmBarcodeLookup } from '../services/nutritionSearchService';
import { useTranslation } from 'react-i18next';
import { useNutritionStyles } from '../../../hooks/useNutritionStyles';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_AREA_SIZE = SCREEN_WIDTH * 0.7;
const SCAN_CONFIRMATION_WINDOW_MS = 800;

type SupportedBarcodeType = 'ean13' | 'ean8' | 'upc_a' | 'upc_e';

type PendingScanState = {
  barcode: string;
  matches: number;
  timestamp: number;
};

type WebBarcodeDetector = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string; format?: string }>>;
};

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
    default:
      return false;
  }
}

interface FoodScannerProps {
  onBarcodeDetected: (barcode: string) => void;
  onClose: () => void;
}

export const FoodScanner: React.FC<FoodScannerProps> = ({ onBarcodeDetected, onClose }) => {
  const { t } = useTranslation();
  const { colors: themeColors, isDark } = useNutritionStyles();
  const isWeb = Platform.OS === 'web';
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [webBarcodeDetectorSupported, setWebBarcodeDetectorSupported] = useState<boolean | null>(null);
  const [webError, setWebError] = useState<string | null>(null);
  const [webInitializing, setWebInitializing] = useState(false);
  const pendingScanRef = useRef<PendingScanState | null>(null);
  const scannedRef = useRef(false);
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const webStreamRef = useRef<MediaStream | null>(null);
  const webDetectorRef = useRef<WebBarcodeDetector | null>(null);
  const webAnimationFrameRef = useRef<number | null>(null);
  const lastWebDetectAtRef = useRef(0);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  useEffect(() => {
    scannedRef.current = scanned;
  }, [scanned]);

  useEffect(() => {
    warmBarcodeLookup();
  }, []);

  useEffect(() => {
    if (!isWeb) return;
    const BarcodeDetectorCtor = (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
    setWebBarcodeDetectorSupported(Boolean(BarcodeDetectorCtor));
  }, [isWeb]);

  const processDetectedBarcode = (rawType: string, rawData: string) => {
    if (scannedRef.current) return;
    const normalizedType = normalizeBarcodeType(rawType);
    if (!normalizedType) {
      return;
    }

    const normalizedBarcode = normalizeBarcode(rawData);
    if (!isValidBarcodeForType(normalizedType, normalizedBarcode)) {
      return;
    }

    const now = Date.now();
    const pendingScan = pendingScanRef.current;

    if (
      pendingScan &&
      pendingScan.barcode === normalizedBarcode &&
      now - pendingScan.timestamp <= SCAN_CONFIRMATION_WINDOW_MS
    ) {
      const nextMatches = pendingScan.matches + 1;
      pendingScanRef.current = {
        barcode: normalizedBarcode,
        matches: nextMatches,
        timestamp: now,
      };

      if (nextMatches >= 2) {
        setScanned(true);
        scannedRef.current = true;
        onBarcodeDetected(normalizedBarcode);
      }
      return;
    }

    pendingScanRef.current = {
      barcode: normalizedBarcode,
      matches: 1,
      timestamp: now,
    };
  };

  const handleBarCodeScanned = (result: BarcodeScanningResult) => {
    processDetectedBarcode(result.type, result.data);
  };

  useEffect(() => {
    if (!isWeb || !permission?.granted || webBarcodeDetectorSupported !== true) {
      return;
    }

    let canceled = false;
    setWebError(null);
    setWebInitializing(true);

    const stopWebScanner = () => {
      if (webAnimationFrameRef.current !== null) {
        cancelAnimationFrame(webAnimationFrameRef.current);
        webAnimationFrameRef.current = null;
      }

      const stream = webStreamRef.current;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      webStreamRef.current = null;

      const video = webVideoRef.current;
      if (video) {
        video.srcObject = null;
      }
    };

    const scanLoop = async (timestamp: number) => {
      if (canceled || scannedRef.current) return;

      if (timestamp - lastWebDetectAtRef.current < 240) {
        webAnimationFrameRef.current = requestAnimationFrame(scanLoop);
        return;
      }
      lastWebDetectAtRef.current = timestamp;

      const detector = webDetectorRef.current;
      const video = webVideoRef.current;
      if (detector && video && video.readyState >= 2) {
        try {
          const detections = await detector.detect(video);
          for (const detection of detections) {
            if (detection.rawValue && detection.format) {
              processDetectedBarcode(detection.format, detection.rawValue);
              if (scannedRef.current) {
                return;
              }
            }
          }
        } catch (_error) {
          // ignore frame-level detection errors
        }
      }

      webAnimationFrameRef.current = requestAnimationFrame(scanLoop);
    };

    const initWebScanner = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setWebError(t('nutrition.webBarcodeUnsupported'));
          setWebInitializing(false);
          return;
        }

        const BarcodeDetectorCtor = (
          globalThis as {
            BarcodeDetector?: new (options: { formats: string[] }) => WebBarcodeDetector;
          }
        ).BarcodeDetector;

        if (!BarcodeDetectorCtor) {
          setWebInitializing(false);
          return;
        }

        webDetectorRef.current = new BarcodeDetectorCtor({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'],
        });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
          },
          audio: false,
        });

        if (canceled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        webStreamRef.current = stream;

        const video = webVideoRef.current;
        if (!video) {
          setWebError(t('nutrition.webBarcodeCameraError'));
          setWebInitializing(false);
          return;
        }

        video.srcObject = stream;
        await video.play();

        if (canceled) return;
        setWebInitializing(false);
        webAnimationFrameRef.current = requestAnimationFrame(scanLoop);
      } catch (_error) {
        setWebError(t('nutrition.webBarcodeCameraError'));
        setWebInitializing(false);
      }
    };

    void initWebScanner();

    return () => {
      canceled = true;
      stopWebScanner();
    };
  }, [isWeb, permission?.granted, t, webBarcodeDetectorSupported]);

  // Permission not determined yet
  if (!permission) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? themeColors.surfaceSolid : '#F5F5F5' }]}>
        <Text style={[styles.permissionText, { color: themeColors.textSecondary }]}>
          {t('nutrition.loadingCamera')}
        </Text>
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? themeColors.surfaceSolid : '#F5F5F5' }]}>
        <ScanBarcode size={64} color="#CCC" />
        <Text style={[styles.permissionTitle, { color: themeColors.textPrimary }]}>
          {t('nutrition.cameraPermissionTitle')}
        </Text>
        <Text style={[styles.permissionText, { color: themeColors.textSecondary }]}>
          {t('nutrition.cameraPermissionRequest')}
        </Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>{t('nutrition.allowCamera')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={[styles.cancelBtnText, { color: themeColors.textSecondary }]}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isWeb && webBarcodeDetectorSupported === false) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? themeColors.surfaceSolid : '#F5F5F5' }]}>
        <ScanBarcode size={64} color="#CCC" />
        <Text style={[styles.permissionTitle, { color: themeColors.textPrimary }]}>
          {t('nutrition.webBarcodeUnsupportedTitle')}
        </Text>
        <Text style={[styles.permissionText, { color: themeColors.textSecondary }]}>
          {t('nutrition.webBarcodeUnsupported')}
        </Text>
        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={[styles.cancelBtnText, { color: themeColors.textSecondary }]}>{t('training.close')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.scannerContainer}>
      {isWeb && webBarcodeDetectorSupported === true ? (
        <View style={StyleSheet.absoluteFill}>
          <video
            ref={webVideoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </View>
      ) : (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={flashOn}
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />
      )}

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top dark area */}
        <View style={styles.overlayTop} />

        {/* Middle row with scan area */}
        <View style={styles.overlayMiddle}>
          <View style={styles.overlaySide} />
          <View style={styles.scanArea}>
            {/* Corner markers */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <View style={styles.overlaySide} />
        </View>

        {/* Bottom dark area */}
        <View style={styles.overlayBottom}>
          {webInitializing ? (
            <Text style={styles.instructionText}>{t('nutrition.loadingCamera')}</Text>
          ) : webError ? (
            <Text style={styles.instructionText}>{webError}</Text>
          ) : (
            <Text style={styles.instructionText}>{t('nutrition.scanBarcodeInstruction')}</Text>
          )}
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlBtn} onPress={onClose}>
          <X size={24} color="#FFF" />
        </TouchableOpacity>

        {!isWeb && (
          <TouchableOpacity style={styles.controlBtn} onPress={() => setFlashOn(!flashOn)}>
            {flashOn ? <FlashlightOff size={24} color="#FFF" /> : <Flashlight size={24} color="#FFF" />}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 40,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginTop: 20,
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionBtn: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
  },
  permissionBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelBtn: {
    marginTop: 12,
    padding: 12,
  },
  cancelBtnText: {
    color: '#999',
    fontSize: 15,
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: SCAN_AREA_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  scanArea: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
    position: 'relative',
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    paddingTop: 30,
  },
  instructionText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '500',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#007AFF',
    borderWidth: 3,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 8,
  },
  controls: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
