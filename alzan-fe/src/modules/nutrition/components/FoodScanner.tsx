// src/modules/nutrition/components/FoodScanner.tsx
// Barcode scanner component using expo-camera

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { X, Flashlight, FlashlightOff, ScanBarcode } from 'lucide-react-native';
import { warmBarcodeLookup } from '../services/nutritionSearchService';
import { useTranslation } from 'react-i18next';
import { useNutritionStyles } from '../../../hooks/useNutritionStyles';
import {
  createBarcodeDetectionState,
  getScannerFrameSize,
  getWebCameraConstraints,
  registerBarcodeDetection,
  resolveWebBarcodeDetectorConstructor,
  shouldPreferEnvironmentCamera,
  shouldRequestCameraPermissionOnScannerOpen,
  stopWebCamera,
} from '../services/barcodeScanner';

type WebBarcodeDetector = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string; format?: string }>>;
};

type WebBarcodeFormat = 'ean_13' | 'ean_8' | 'upc_a' | 'upc_e' | 'qr_code';

type WebBarcodeDetectorConstructor = new (options: { formats: WebBarcodeFormat[] }) => WebBarcodeDetector;

interface FoodScannerProps {
  onBarcodeDetected: (barcode: string) => void;
  onClose: () => void;
}

export const FoodScanner: React.FC<FoodScannerProps> = ({ onBarcodeDetected, onClose }) => {
  const { t } = useTranslation();
  const { colors: themeColors, isDark } = useNutritionStyles();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const scanAreaSize = getScannerFrameSize({ width: viewportWidth, height: viewportHeight });
  const isWeb = Platform.OS === 'web';
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [webBarcodeDetectorSupported, setWebBarcodeDetectorSupported] = useState<boolean | null>(null);
  const [webError, setWebError] = useState<string | null>(null);
  const [webInitializing, setWebInitializing] = useState(false);
  const [webScannerAttempt, setWebScannerAttempt] = useState(0);
  const permissionRequestedRef = useRef(false);
  const pendingScanRef = useRef(createBarcodeDetectionState());
  const scannedRef = useRef(false);
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const webStreamRef = useRef<MediaStream | null>(null);
  const webDetectorRef = useRef<WebBarcodeDetector | null>(null);
  const webAnimationFrameRef = useRef<number | null>(null);
  const stopWebScannerRef = useRef<(() => void) | null>(null);
  const lastWebDetectAtRef = useRef(0);
  const consecutiveWebDetectionErrorsRef = useRef(0);

  useEffect(() => {
    if (isWeb || !shouldRequestCameraPermissionOnScannerOpen(permission, permissionRequestedRef.current)) {
      return;
    }

    permissionRequestedRef.current = true;
    void requestPermission();
  }, [isWeb, permission, requestPermission]);

  useEffect(() => {
    scannedRef.current = scanned;
  }, [scanned]);

  useEffect(() => {
    warmBarcodeLookup();
  }, []);

  useEffect(() => {
    if (!isWeb) return;
    setWebBarcodeDetectorSupported(Boolean(navigator.mediaDevices?.getUserMedia));
  }, [isWeb]);

  const processDetectedBarcode = (rawType: string, rawData: string) => {
    if (scannedRef.current) return;
    const detection = registerBarcodeDetection(pendingScanRef.current, {
      rawType,
      rawData,
      timestamp: Date.now(),
    });
    pendingScanRef.current = detection.state;

    if (!detection.confirmedBarcode) return;
    setScanned(true);
    scannedRef.current = true;
    stopWebScannerRef.current?.();
    onBarcodeDetected(detection.confirmedBarcode);
  };

  const handleBarCodeScanned = (result: BarcodeScanningResult) => {
    processDetectedBarcode(result.type, result.data);
  };

  useEffect(() => {
    if (!isWeb || webBarcodeDetectorSupported !== true) {
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

      stopWebCamera(webStreamRef.current, webVideoRef.current);
      webStreamRef.current = null;
    };
    stopWebScannerRef.current = stopWebScanner;

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
          consecutiveWebDetectionErrorsRef.current = 0;
          for (const detection of detections) {
            if (detection.rawValue && detection.format) {
              processDetectedBarcode(detection.format, detection.rawValue);
              if (scannedRef.current) {
                return;
              }
            }
          }
        } catch (_error) {
          consecutiveWebDetectionErrorsRef.current += 1;
          if (consecutiveWebDetectionErrorsRef.current >= 5) {
            stopWebScanner();
            setWebError(t('nutrition.webBarcodeCameraError'));
            return;
          }
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

        const nativeDetectorConstructor = (
          globalThis as {
            BarcodeDetector?: WebBarcodeDetectorConstructor;
          }
        ).BarcodeDetector;

        const BarcodeDetectorCtor = await resolveWebBarcodeDetectorConstructor(nativeDetectorConstructor, async () => {
          const { BarcodeDetector, setZXingModuleOverrides } = await import('barcode-detector/ponyfill');
          setZXingModuleOverrides({
            locateFile: (fileName: string) => (fileName.endsWith('.wasm') ? '/zxing_reader.wasm' : fileName),
          });
          return BarcodeDetector;
        });

        webDetectorRef.current = new BarcodeDetectorCtor({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'],
        });

        const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
        const preferEnvironmentCamera = shouldPreferEnvironmentCamera(hasCoarsePointer, navigator.maxTouchPoints ?? 0);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: getWebCameraConstraints(preferEnvironmentCamera),
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
      stopWebScannerRef.current = null;
    };
  }, [isWeb, t, webBarcodeDetectorSupported, webScannerAttempt]);

  const handleClose = () => {
    stopWebScannerRef.current?.();
    onClose();
  };

  // Permission not determined yet
  if (!isWeb && !permission) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? themeColors.surfaceSolid : '#F5F5F5' }]}>
        <Text style={[styles.permissionText, { color: themeColors.textSecondary }]}>
          {t('nutrition.loadingCamera')}
        </Text>
      </View>
    );
  }

  // Permission denied
  if (!isWeb && permission && !permission.granted) {
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
        <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
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
        <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
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
            barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />
      )}

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top dark area */}
        <View style={styles.overlayTop} />

        {/* Middle row with scan area */}
        <View style={[styles.overlayMiddle, { height: scanAreaSize }]}>
          <View style={styles.overlaySide} />
          <View style={[styles.scanArea, { width: scanAreaSize, height: scanAreaSize }]}>
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
            <View style={styles.webErrorState}>
              <Text style={styles.instructionText}>{webError}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.retryBtn}
                onPress={() => setWebScannerAttempt(attempt => attempt + 1)}
              >
                <Text style={styles.retryBtnText}>{t('nutrition.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.instructionText}>{t('nutrition.scanBarcodeInstruction')}</Text>
          )}
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlBtn} onPress={handleClose}>
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
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  scanArea: {
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
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  webErrorState: {
    alignItems: 'center',
    gap: 16,
  },
  retryBtn: {
    minWidth: 120,
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 22,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
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
