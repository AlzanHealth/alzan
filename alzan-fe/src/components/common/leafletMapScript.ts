import type { Map, Polyline } from 'leaflet';

/**
 * We cannot import Leaflet directly because this code runs INSIDE the WebView/iframe,
 * where `L` is injected globally via the CDN script tag.
 * We use `typeof import('leaflet')` just for type definitions.
 */
declare const L: typeof import('leaflet');

/**
 * Type expected to be passed into the window by the React Native side
 */
interface MapConfig {
  latlngs: [number, number][];
  strokeColor: string;
  isDark?: boolean;
  isInteractive?: boolean;
}

declare global {
  interface Window {
    __MAP_CONFIG__: MapConfig;
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
  }
}

/**
 * This function will be toString()-ed and injected into the WebView HTML.
 * It strictly executes in the browser context of the WebView.
 */
export function initLeafletMap() {
  const config = window.__MAP_CONFIG__;
  if (!config || !config.latlngs || config.latlngs.length < 2) return;

  const { strokeColor, isDark = false, isInteractive = true } = config;
  const latlngs = config.latlngs.filter(([lat, lon]) => {
    return isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  });
  if (latlngs.length < 2) return;

  // Compute center
  const lats = latlngs.map(c => c[0]);
  const lons = latlngs.map(c => c[1]);
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;

  // Initialize map
  const map: Map = L.map('map', {
    center: [centerLat, centerLon],
    zoom: 13,
    zoomControl: false, // Keep UI clean
    attributionControl: true,
    scrollWheelZoom: isInteractive,
    dragging: isInteractive,
    doubleClickZoom: isInteractive,
    touchZoom: isInteractive,
    boxZoom: isInteractive,
    keyboard: isInteractive,
  });

  const postStatus = (status: string, message?: string) => {
    if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) return;
    window.ReactNativeWebView.postMessage(status + (message ? `:${message}` : ''));
  };

  // CARTO can return an API-key notice as a successful image, bypassing tileerror.
  // Use the existing keyless provider directly; request only visible tiles.
  const primaryLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    referrerPolicy: 'strict-origin-when-cross-origin',
  });

  let hasReportedReady = false;
  const reportReady = () => {
    if (hasReportedReady) return;
    hasReportedReady = true;
    postStatus('map-ready');
  };

  let fallbackErrored = false;
  const reportFatalTileError = (reason: string) => {
    if (hasReportedReady || fallbackErrored) return;
    fallbackErrored = true;
    postStatus('map-error', reason);
  };

  primaryLayer.on('tileload', reportReady);
  primaryLayer.on('tileerror', () => {
    reportFatalTileError('tile-provider-unavailable');
  });

  primaryLayer.addTo(map);

  // Route casing to make the path stand out over a low-detail basemap.
  L.polyline(latlngs, {
    color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.95)',
    weight: 6,
    opacity: isDark ? 0.45 : 0.9,
    smoothFactor: 1.5,
  }).addTo(map);

  // Add route polyline
  const route: Polyline = L.polyline(latlngs, {
    color: strokeColor,
    weight: 4,
    opacity: 0.98,
    smoothFactor: 1.5,
  }).addTo(map);

  // Add start marker (green)
  L.circleMarker(latlngs[0], {
    radius: 6,
    color: '#fff',
    weight: 2,
    fillColor: '#2fcc71',
    fillOpacity: 1,
  }).addTo(map);

  // Add end marker (route color)
  L.circleMarker(latlngs[latlngs.length - 1], {
    radius: 6,
    color: '#fff',
    weight: 2,
    fillColor: strokeColor,
    fillOpacity: 1,
  }).addTo(map);

  // Fit bounds to polyline
  const bounds = route.getBounds();
  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [18, 18] });
  }

  // Some Android WebViews need a delayed size invalidation to paint tiles correctly.
  setTimeout(() => {
    map.invalidateSize();
  }, 32);

  setTimeout(() => {
    if (!hasReportedReady && !fallbackErrored) {
      reportFatalTileError('tile-load-timeout');
    }
  }, 5000);
}
