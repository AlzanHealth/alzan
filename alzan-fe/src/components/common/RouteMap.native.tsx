import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Modal, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Camera, CircleLayer, LineLayer, MapView, ShapeSource } from '@maplibre/maplibre-react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Polyline as SvgPolyline,
  Rect,
  Stop,
} from 'react-native-svg';
import { decodePolyline, type LatLon } from '../../services/mapService';
import { useTranslation } from 'react-i18next';

export interface RouteMapProps {
  /** Google-encoded polyline string. Renders nothing when null or invalid. */
  polyline: string | null | undefined;
  /** Map height in pixels. Default: 200 */
  height?: number;
  /** Route line and end-marker colour. Default: '#6C63FF' */
  strokeColor?: string;
  /** Enables dark map style when true. */
  isDark?: boolean;
  /** Optional container style override */
  style?: StyleProp<ViewStyle>;
  /** Called when the user starts interacting with the map (touch down). Use to disable parent scroll. */
  onInteractionStart?: () => void;
  /** Called when the user stops interacting with the map (touch up). Use to re-enable parent scroll. */
  onInteractionEnd?: () => void;
  /** Enables panning/zoom interactions. Default: true */
  isInteractive?: boolean;
}

type LngLat = [number, number];

type Bounds = {
  ne: LngLat;
  sw: LngLat;
};

type ParsedRoute = {
  valid: boolean;
  normalised: Array<{ x: number; y: number }>;
  lineFeature: GeoJSON.Feature<GeoJSON.LineString> | null;
  startFeature: GeoJSON.Feature<GeoJSON.Point> | null;
  endFeature: GeoJSON.Feature<GeoJSON.Point> | null;
  bounds: Bounds | null;
};

const MAX_POINTS = 2000;
const CAMERA_PADDING = 28;
const OPEN_FREE_MAP_LIGHT_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const OPEN_FREE_MAP_DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

function sampleCoords(coords: LatLon[], maxPoints: number): LatLon[] {
  if (coords.length <= maxPoints) return coords;

  const step = (coords.length - 1) / (maxPoints - 1);
  const sampled: LatLon[] = [];

  for (let index = 0; index < maxPoints; index += 1) {
    sampled.push(coords[Math.round(index * step)]);
  }

  return sampled;
}

function isValidLatLon([lat, lon]: LatLon): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function sanitizeCoords(coords: LatLon[]): LatLon[] {
  const cleaned: LatLon[] = [];
  for (const coord of coords) {
    if (!isValidLatLon(coord)) continue;
    const previous = cleaned[cleaned.length - 1];
    if (previous && previous[0] === coord[0] && previous[1] === coord[1]) continue;
    cleaned.push(coord);
  }
  return cleaned.length >= 2 ? cleaned : [];
}

function normaliseCoords(coords: LatLon[]) {
  const lats = coords.map(([lat]) => lat);
  const lons = coords.map(([, lon]) => lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const latRange = maxLat - minLat || 1;
  const lonRange = maxLon - minLon || 1;
  const scale = Math.max(latRange, lonRange);

  const pad = 6;
  const span = 100 - pad * 2;

  return coords.map(([lat, lon]) => {
    const x = pad + ((lon - minLon) / scale) * span;
    const y = 100 - (pad + ((lat - minLat) / scale) * span);
    return { x, y };
  });
}

function toLngLat(coord: LatLon): LngLat {
  return [coord[1], coord[0]];
}

function getBounds(coords: LatLon[]): Bounds {
  const lats = coords.map(([lat]) => lat);
  const lons = coords.map(([, lon]) => lon);

  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLon = Math.min(...lons);
  let maxLon = Math.max(...lons);

  // Avoid zero-area bounds for very short/static tracks.
  if (minLat === maxLat) {
    minLat -= 0.0005;
    maxLat += 0.0005;
  }

  if (minLon === maxLon) {
    minLon -= 0.0005;
    maxLon += 0.0005;
  }

  return {
    ne: [maxLon, maxLat],
    sw: [minLon, minLat],
  };
}

function buildLineFeature(coords: LatLon[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: coords.map(toLngLat),
    },
  };
}

function buildPointFeature(coord: LatLon): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Point',
      coordinates: toLngLat(coord),
    },
  };
}

function parseRoute(polyline: string | null | undefined): ParsedRoute {
  if (!polyline) {
    return {
      valid: false,
      normalised: [],
      lineFeature: null,
      startFeature: null,
      endFeature: null,
      bounds: null,
    };
  }

  try {
    const decoded = sanitizeCoords(decodePolyline(polyline));
    if (decoded.length < 2) {
      return {
        valid: false,
        normalised: [],
        lineFeature: null,
        startFeature: null,
        endFeature: null,
        bounds: null,
      };
    }

    const sampled = sampleCoords(decoded, MAX_POINTS);
    const start = sampled[0];
    const end = sampled[sampled.length - 1];

    return {
      valid: true,
      normalised: normaliseCoords(sampled),
      lineFeature: buildLineFeature(sampled),
      startFeature: buildPointFeature(start),
      endFeature: buildPointFeature(end),
      bounds: getBounds(sampled),
    };
  } catch {
    return {
      valid: false,
      normalised: [],
      lineFeature: null,
      startFeature: null,
      endFeature: null,
      bounds: null,
    };
  }
}

function renderSvgFallback(
  normalised: Array<{ x: number; y: number }>,
  strokeColor: string,
  containerStyle: StyleProp<ViewStyle>,
) {
  const fallbackPolyline = normalised.map(point => `${point.x},${point.y}`).join(' ');
  const firstPoint = normalised[0];
  const lastPoint = normalised[normalised.length - 1];

  return (
    <View style={[styles.fallbackContainer, containerStyle]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <SvgLinearGradient id="routeBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#0f172a" />
            <Stop offset="100%" stopColor="#111827" />
          </SvgLinearGradient>
        </Defs>

        <Rect x="0" y="0" width="100" height="100" fill="url(#routeBg)" />

        <SvgPolyline
          points={fallbackPolyline}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {firstPoint && (
          <Circle cx={firstPoint.x} cy={firstPoint.y} r="1.9" fill="#2fcc71" stroke="#fff" strokeWidth="0.7" />
        )}
        {lastPoint && (
          <Circle cx={lastPoint.x} cy={lastPoint.y} r="1.9" fill={strokeColor} stroke="#fff" strokeWidth="0.7" />
        )}
      </Svg>
    </View>
  );
}

export const RouteMap: React.FC<RouteMapProps> = ({
  polyline,
  height = 200,
  strokeColor = '#6C63FF',
  isDark = false,
  style,
  onInteractionStart,
  onInteractionEnd,
  isInteractive = true,
}) => {
  const { t } = useTranslation();
  const [mapFailed, setMapFailed] = useState(false);
  const [showAttribution, setShowAttribution] = useState(false);
  const parsedRoute = useMemo(() => parseRoute(polyline), [polyline]);
  const instanceIdRef = useRef(`route-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    setMapFailed(false);
  }, [polyline]);

  if (!parsedRoute.valid) {
    return null;
  }

  const containerStyle: ViewStyle = {
    height,
    borderRadius: 12,
    overflow: 'hidden',
  };

  if (
    mapFailed ||
    !parsedRoute.bounds ||
    !parsedRoute.lineFeature ||
    !parsedRoute.startFeature ||
    !parsedRoute.endFeature
  ) {
    return renderSvgFallback(parsedRoute.normalised, strokeColor, [containerStyle, style]);
  }

  const sourcePrefix = instanceIdRef.current;
  const mapStyleUrl = isDark ? OPEN_FREE_MAP_DARK_STYLE_URL : OPEN_FREE_MAP_LIGHT_STYLE_URL;

  return (
    <View style={[containerStyle, style]}>
      <MapView
        style={styles.map}
        mapStyle={mapStyleUrl}
        pitchEnabled={false}
        rotateEnabled={false}
        zoomEnabled={isInteractive}
        scrollEnabled={isInteractive}
        attributionEnabled={true}
        onRegionWillChange={() => {
          if (isInteractive) {
            onInteractionStart?.();
          }
        }}
        onRegionDidChange={() => {
          if (isInteractive) {
            onInteractionEnd?.();
          }
        }}
        onDidFailLoadingMap={() => setMapFailed(true)}
      >
        <Camera
          animationDuration={0}
          bounds={{
            ne: parsedRoute.bounds.ne,
            sw: parsedRoute.bounds.sw,
            paddingTop: CAMERA_PADDING,
            paddingBottom: CAMERA_PADDING,
            paddingLeft: CAMERA_PADDING,
            paddingRight: CAMERA_PADDING,
          }}
        />

        <ShapeSource id={`${sourcePrefix}-route-source`} shape={parsedRoute.lineFeature}>
          <LineLayer
            id={`${sourcePrefix}-route-line-casing`}
            style={{
              lineColor: isDark ? 'rgba(255,255,255,0.36)' : 'rgba(255,255,255,0.95)',
              lineWidth: 6,
              lineCap: 'round',
              lineJoin: 'round',
              lineOpacity: isDark ? 0.5 : 0.9,
            }}
          />
          <LineLayer
            id={`${sourcePrefix}-route-line`}
            style={{
              lineColor: strokeColor,
              lineWidth: 4.2,
              lineCap: 'round',
              lineJoin: 'round',
              lineOpacity: 0.98,
            }}
          />
        </ShapeSource>

        <ShapeSource id={`${sourcePrefix}-start-source`} shape={parsedRoute.startFeature}>
          <CircleLayer
            id={`${sourcePrefix}-start-point`}
            style={{
              circleColor: '#2fcc71',
              circleRadius: 4.5,
              circleStrokeColor: '#ffffff',
              circleStrokeWidth: 1.5,
            }}
          />
        </ShapeSource>

        <ShapeSource id={`${sourcePrefix}-end-source`} shape={parsedRoute.endFeature}>
          <CircleLayer
            id={`${sourcePrefix}-end-point`}
            style={{
              circleColor: strokeColor,
              circleRadius: 4.5,
              circleStrokeColor: '#ffffff',
              circleStrokeWidth: 1.5,
            }}
          />
        </ShapeSource>
      </MapView>

      {isInteractive && (
        <Pressable
          style={[styles.infoButton, isDark ? styles.infoButtonDark : styles.infoButtonLight]}
          onPress={() => setShowAttribution(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.infoButtonText, isDark ? styles.infoButtonTextDark : styles.infoButtonTextLight]}>
            i
          </Text>
        </Pressable>
      )}

      <Modal
        transparent
        animationType="fade"
        visible={isInteractive && showAttribution}
        onRequestClose={() => setShowAttribution(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowAttribution(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{t('training.mapInfoTitle')}</Text>
            <Text style={styles.modalText}>{t('training.mapInfoDescription')}</Text>

            <View style={styles.modalLinksRow}>
              <Pressable onPress={() => Linking.openURL('https://openfreemap.org/')}>
                <Text style={styles.modalLink}>{t('training.mapInfoProviderLink')}</Text>
              </Pressable>
              <Pressable onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}>
                <Text style={styles.modalLink}>{t('training.mapInfoDataLink')}</Text>
              </Pressable>
            </View>

            <Pressable style={styles.modalCloseButton} onPress={() => setShowAttribution(false)}>
              <Text style={styles.modalCloseText}>{t('training.close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  infoButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoButtonLight: {
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  infoButtonDark: {
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  infoButtonText: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  infoButtonTextLight: {
    color: '#111827',
  },
  infoButtonTextDark: {
    color: '#E5E7EB',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 14,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 16,
    gap: 10,
  },
  modalTitle: {
    color: '#F3F4F6',
    fontSize: 16,
    fontWeight: '700',
  },
  modalText: {
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 18,
  },
  modalLinksRow: {
    gap: 8,
  },
  modalLink: {
    color: '#60A5FA',
    fontSize: 13,
    fontWeight: '600',
  },
  modalCloseButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(96,165,250,0.18)',
  },
  modalCloseText: {
    color: '#DBEAFE',
    fontWeight: '600',
    fontSize: 13,
  },
  fallbackContainer: {
    backgroundColor: '#0f0f14',
  },
});
