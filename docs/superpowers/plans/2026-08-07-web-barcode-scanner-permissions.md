# Web Barcode Scanner and Permission Timing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `shared-executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop requesting camera and microphone access on Home, and make EAN/UPC scanning work in Safari and other web browsers that provide `getUserMedia`.

**Architecture:** Camera permission is requested only when `FoodScanner` is mounted after an explicit scanner action. Native continues to use `expo-camera`; web keeps the native `BarcodeDetector` fast path and dynamically loads a ZXing-WASM ponyfill when the browser API is absent, so Safari can decode EAN-13, EAN-8, UPC-A, and UPC-E without requesting audio.

**Tech Stack:** Expo SDK 54, React Native Web, TypeScript, `expo-camera`, `barcode-detector/ponyfill`, node assertions executed with `tsx`.

---

### Task 1: Remove eager media permission requests

**Files:**
- Modify: `alzan-fe/src/screens/home/HomeScreen.tsx`
- Delete if unused: `alzan-fe/src/hooks/useMediaPermissions.ts`
- Delete if unused: `alzan-fe/src/services/PermissionService.ts`

- [ ] Remove the `useMediaPermissions` import and invocation from Home so entering the app never calls camera or microphone permission APIs.
- [ ] Confirm with `rg` that the hook and permission service have no consumers before deleting them.
- [ ] Preserve Expo audio configuration because this task changes runtime scanner behavior, not unrelated native audio capabilities.

### Task 2: Define and test barcode compatibility rules

**Files:**
- Create: `alzan-fe/src/modules/nutrition/services/barcodeScanner.ts`
- Create: `alzan-fe/src/modules/nutrition/services/barcodeScanner.spec.ts`

- [ ] Write assertions showing that native and web format names normalize to `ean13`, `ean8`, `upc_a`, or `upc_e`, invalid formats are rejected, numeric lengths are validated, and repeated detections are required within the confirmation window.
- [ ] Run `pnpm --prefix alzan-fe exec tsx src/modules/nutrition/services/barcodeScanner.spec.ts` and verify the test fails because the service does not exist.
- [ ] Implement pure normalization, validation, and confirmation helpers used by both native and web detection paths.
- [ ] Re-run the focused test and verify it passes.

### Task 3: Add a Safari-compatible web detector

**Files:**
- Modify: `alzan-fe/package.json`
- Modify: `alzan-fe/pnpm-lock.yaml`
- Modify: `alzan-fe/src/modules/nutrition/components/FoodScanner.tsx`

- [ ] Add `barcode-detector` with pnpm so Expo resolves its ZXing-WASM runtime from the lockfile.
- [ ] Keep the browser's `BarcodeDetector` when available; otherwise dynamically import `barcode-detector/ponyfill` only on web.
- [ ] Initialize the camera stream with `{ video: { facingMode: { ideal: 'environment' } }, audio: false }` only after `FoodScanner` opens.
- [ ] Decode video frames through the selected detector, pass results through the tested confirmation helper, and stop every video track plus animation frame on close or successful scan.
- [ ] If neither `getUserMedia` nor detector initialization is available, retain a translated unavailable/error state rather than breaking navigation.

### Task 4: Verify behavior and repository quality

**Files:**
- Modify only if copy changes are required: `alzan-fe/src/i18n/locales/en.ts`
- Modify only if copy changes are required: `alzan-fe/src/i18n/locales/es.ts`

- [ ] Run the focused barcode scanner test.
- [ ] Run `pnpm --prefix alzan-fe run typecheck`.
- [ ] Run `pnpm --prefix alzan-fe run build:web` to prove the WASM dependency exports correctly.
- [ ] Inspect the local web app: Home must not request camera or microphone; opening the scanner may request only camera; closing it must release the stream.
- [ ] Run the mandatory local gate: `pnpm format`, `pnpm run lint:check`, and `pnpm run verify:import-review`.
- [ ] Run `git diff --check` and review the final diff for unrelated files, debug logs, dead code, and accidental native behavior changes.

### Task 5: Fix the black desktop scanner state

**Files:**
- Modify: `alzan-fe/src/modules/nutrition/services/barcodeScanner.spec.ts`
- Modify: `alzan-fe/src/modules/nutrition/services/barcodeScanner.ts`
- Modify: `alzan-fe/src/modules/nutrition/components/FoodScanner.tsx`

- [ ] Add failing assertions proving that a 1900×1180 viewport produces a frame no larger than 520 px, portrait and landscape mobile frames remain inside the available height, desktop camera constraints omit `facingMode`, and touch devices prefer `environment`.
- [ ] Run `pnpm --prefix alzan-fe exec tsx src/modules/nutrition/services/barcodeScanner.spec.ts` and verify the new assertions fail because the viewport and camera-constraint helpers do not exist.
- [ ] Implement pure `getScannerFrameSize`, `shouldPreferEnvironmentCamera`, and `getWebCameraConstraints` helpers.
- [ ] Replace the module-level width calculation with `useWindowDimensions`, apply the computed width and height to the scanner frame, request the default camera on desktop, and retain the rear-camera preference on touch devices.
- [ ] Reuse `common.retry` to expose a visible retry action when web camera initialization fails; restarting must tear down the previous stream before creating a new one.
- [ ] Re-run the focused test and verify it passes.
- [ ] Verify `localhost:8082` at 1900×1180 and a mobile viewport in Chromium and WebKit: the frame, instruction, and error/retry state must stay visible, and audio must remain disabled.
