import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { initLeafletMap } from './leafletMapScript';

const script = initLeafletMap.toString();
assert.doesNotMatch(script, /cartocdn/, 'Do not request CARTO tiles without an API key');
assert.match(script, /https:\/\/tile\.openstreetmap\.org/);
assert.match(script, /attributionControl:\s*true/);
assert.match(script, /OpenStreetMap/);
const web = readFileSync(new URL('./RouteMap.web.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(web, /\.leaflet-control-attribution[^\n]*display:none/);
const native = readFileSync(new URL('./RouteMap.native.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(native, /cartocdn/);
assert.match(native, /https:\/\/tiles\.openfreemap\.org\/styles\/dark/);
assert.match(native, /attributionEnabled=\{true\}/);
console.log('Map providers: no unkeyed CARTO and visible attribution on web/native');
