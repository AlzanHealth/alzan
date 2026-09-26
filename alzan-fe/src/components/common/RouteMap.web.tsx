import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { decodePolyline } from '../../services/mapService';
import { LEAFLET_CSS, LEAFLET_JS } from './leafletInlineAssets';
import { initLeafletMap } from './leafletMapScript';

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
  /** Called when the user starts interacting with the map (touch down). */
  onInteractionStart?: () => void;
  /** Called when the user stops interacting with the map (touch up). */
  onInteractionEnd?: () => void;
  /** Enables panning/zoom interactions. Default: true */
  isInteractive?: boolean;
}

type LatLngTuple = [number, number];

function buildLeafletHtml(
  latlngs: LatLngTuple[],
  strokeColor: string,
  isDark: boolean,
  isInteractive: boolean,
): string {
  const safeLeafletCss = LEAFLET_CSS.replace(/<\/style/gi, '<\\/style');
  const safeLeafletJs = LEAFLET_JS.replace(/<\/script/gi, '<\\/script');
  const mapBackground = isDark ? '#0f1115' : '#eef2f5';

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=yes"/>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body,#map{width:100%;height:100%;background:${mapBackground};touch-action:manipulation}
    .leaflet-control-zoom{display:none!important}
    ${isDark ? '.leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9)}' : ''}
    ${safeLeafletCss}
  </style>
</head>
<body>
<div id="map"></div>
<script>
  ${safeLeafletJs}
</script>
<script>
  window.__MAP_CONFIG__ = ${JSON.stringify({ latlngs, strokeColor, isDark, isInteractive })};
  var initMap = ${initLeafletMap.toString()};
  initMap();
</script>
</body>
</html>`;
}

function sampleCoords(coords: LatLngTuple[], maxPoints: number): LatLngTuple[] {
  if (coords.length <= maxPoints) return coords;

  const step = (coords.length - 1) / (maxPoints - 1);
  const sampled: LatLngTuple[] = [];

  for (let index = 0; index < maxPoints; index += 1) {
    sampled.push(coords[Math.round(index * step)]);
  }

  return sampled;
}

function isValidLatLng([lat, lon]: LatLngTuple): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function sanitizeCoords(coords: LatLngTuple[]): LatLngTuple[] {
  const cleaned: LatLngTuple[] = [];
  for (const coord of coords) {
    if (!isValidLatLng(coord)) continue;
    const previous = cleaned[cleaned.length - 1];
    if (previous && previous[0] === coord[0] && previous[1] === coord[1]) continue;
    cleaned.push(coord);
  }
  return cleaned.length >= 2 ? cleaned : [];
}

export const RouteMap: React.FC<RouteMapProps> = ({
  polyline,
  height = 200,
  strokeColor = '#6C63FF',
  isDark = false,
  style,
  isInteractive = true,
}) => {
  const html = useMemo(() => {
    if (!polyline) return null;

    try {
      const decoded = sanitizeCoords(decodePolyline(polyline));
      if (decoded.length < 2) return null;

      const sampled = sampleCoords(decoded, 1500);
      return buildLeafletHtml(sampled, strokeColor, isDark, isInteractive);
    } catch {
      return null;
    }
  }, [isDark, isInteractive, polyline, strokeColor]);

  if (!html) return null;

  return (
    <View style={[styles.container, { height, backgroundColor: isDark ? '#0f1115' : '#eef2f5' }, style]}>
      {React.createElement('iframe', {
        srcDoc: html,
        style: {
          width: '100%',
          height: '100%',
          border: 'none',
          pointerEvents: isInteractive ? 'auto' : 'none',
        },
        sandbox: 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox',
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0f0f14',
  },
});
