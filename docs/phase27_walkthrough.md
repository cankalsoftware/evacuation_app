# Phase 27: Wi-Fi Routing & Dual-Pinned GPS Handoffs Walkthrough

## What was Changed

### 1. Database Schema (`convex/schema.ts` & `convex/portal.ts`)
- Updated the `wifiFingerprints` table to support `nodeType` (`ENTRANCE`, `FIRE_EXIT`, `SAFE_PATH`).
- Added dual-pin support by including `gpsLat` and `gpsLon` to bind Wi-Fi signatures with high-accuracy GPS coordinates at physical thresholds.
- Updated the `saveWifiFingerprints` mutation to correctly accept and store these new properties.

### 2. Master Floor Plan V2 (`components/MasterFloorPlanV2.tsx`)
- Created a brand-new component dedicated to the Phase 27 mapping flow without disrupting Map Editor V1.
- Implemented **Dual-Pin Capture Flow**:
  - The Admin can select either `Entrance`, `Fire Exit`, or `Safe Route`.
  - For Entrances and Fire Exits, the system prompts a two-step capture: first stepping outside to capture the GPS pin, then stepping inside the doorway to capture the ambient Wi-Fi BSSID fingerprint.

### 3. Admin Dashboard Integration (`components/AdminDashboard.tsx`)
- Added a new, distinct button: **"📡 Master Floor Plan V2"**.
- This acts as the "Second Option" requested, leaving the original Grid/GPS drag-and-drop map editor completely intact and unchanged.

### 4. Tracking State Machine (`components/EvacuationMode.tsx`)
- Implemented an `envState` tracker to manage whether the evacuating user is `OUTDOOR` or `INDOOR`.
- **OUTDOOR Mode**: Uses `Location.watchPositionAsync` for live high-accuracy GPS tracking. Once the user's distance to a known `ENTRANCE` node falls below 2 meters, the app triggers a handoff to `INDOOR` mode.
- **INDOOR Mode**: Shuts off the GPS watcher to save battery and stop erratic jumping. Relies entirely on the background Wi-Fi scanner and pedometer. If the Wi-Fi scanner hits a `FIRE_EXIT` node and subsequently loses signal, it hands off back to `OUTDOOR` mode.

## Validation
- [x] Schema mutations compile and run.
- [x] `MasterFloorPlanV2` successfully renders and handles the 2-step dual-pin logic.
- [x] `EvacuationMode` tracks the `envState` and transitions smoothly without crashing.

---

## Phase 27 Tasks

- [x] Clone `components/MasterFloorPlan.tsx` into `components/MasterFloorPlanV2.tsx` (if Map Editor logic is in MasterFloorPlan)
- [x] Modify `components/MasterFloorPlanV2.tsx` Step 2:
  - [x] Remove grid overlay and controls
  - [x] Rename "Exit" to "Fire Exit"
  - [x] Add "Entrance" button
  - [x] Replace "Safe Route" with "Wi-Fi Calibration Walk"
  - [x] Implement Dual-pin capture (GPS + Wi-Fi) for Entrance and Fire Exit
- [x] Add `MasterFloorPlanV2` access to Admin Dashboard (Second Option)
- [x] Update `convex/schema.ts`:
  - [x] Update `wifiFingerprints` to include `nodeType` (`ENTRANCE`, `FIRE_EXIT`, `SAFE_PATH`)
  - [x] Add `gpsCoords` to `wifiFingerprints` (for Entrance and Fire Exit)
- [x] Update `convex/portal.ts` to support the new schema and queries
- [x] Modify `components/EvacuationMode.tsx`:
  - [x] Implement Tracking State Machine (`OUTDOOR` vs `INDOOR`)
  - [x] Implement GPS to Wi-Fi handoff logic
