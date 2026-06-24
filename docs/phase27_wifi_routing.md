# Phase 27: Wi-Fi Routing, Dual-Pinned GPS Handoffs, & Master Floor Plan V2

Based on your outdoor tests confirming high-accuracy GPS (<1 to 3 meters) under clear skies, we are refining the handoff logic. We will explicitly link the highly accurate external GPS to the indoor Wi-Fi networks directly at the physical doorway thresholds. 

**CRITICAL RULE:** We are **NOT** removing or replacing any existing buttons, logic, or flows in the current `AdminDashboard` or Map Editor V1. Everything built in Phase 27 will exist purely as a **Second Option** (Master Floor Plan V2) for the Admin to select.

## Goal
Implement a robust GPS-to-Wi-Fi handoff system by capturing "Dual-Pins" at every door (one GPS pin outside, one Wi-Fi pin inside). This allows the app to seamlessly transition users as they cross the threshold. Indoor routing will rely purely on Wi-Fi pin routing.

## Handoff Mechanics

> [!NOTE]
> **Handoff Mechanism (GPS -> Wi-Fi):** When a user is outside, the app tracks them using GPS. Once the GPS shows them within 1-2 meters of a registered `ENTRANCE` GPS pin, the app will activate the Wi-Fi scanner. The moment the indoor Wi-Fi pin signature is detected, the app locks into "Indoor Mode".
> **Handoff Mechanism (Wi-Fi -> GPS):** When a user is following an indoor `SAFE_ROUTE` and hits a `FIRE_EXIT` Wi-Fi pin, the app knows they are at the door. Once they step outside and the Wi-Fi signal drops, it instantly switches back to GPS to route them to the Assembly Point.

## Proposed Changes

### 1. `components/MasterFloorPlanV2.tsx` [NEW - Cloned Component]
- We will CLONE the existing Map Editor logic into a new component called `MasterFloorPlanV2` to ensure minimal disruption.
- **Step 1 (Upload & Boundary Setup):** Remains EXACTLY the same. Pan, zoom, and upload flow are untouched.
- **Step 2 (Mapping Phase Changes):**
  - **Grid System:** Remove the grid overlay and grid size controls entirely from V2.
  - **Exits:** Rename the existing "Exit" button to **"Fire Exit"**.
  - **Entrances:** Add a new **"Entrance"** button for mapping the GPS-to-Wi-Fi handoff points.
  - **Safe Route:** Replace the old drag-and-drop GPS safe route logic with the new **Wi-Fi Calibration Walk**. The Admin will physically walk the safe route and drop Wi-Fi pins along the path.

### 2. Dual-Pin Capture Flow in Step 2
- When adding an **Entrance** or **Fire Exit**, the UI will prompt the Admin to:
  1. *Step Outside:* Capture the GPS coordinate.
  2. *Step Inside:* Capture the Wi-Fi BSSID fingerprint.

### 3. `convex/schema.ts` & `convex/portal.ts` [MODIFY]
- Update the `wifiFingerprints` table to store `nodeType`: `ENTRANCE`, `FIRE_EXIT`, `SAFE_PATH`.
- For `ENTRANCE` and `FIRE_EXIT` nodes, store both `gpsCoords` (lat/lng) and `wifiData` (BSSIDs and averaged RSSI).

### 4. `components/EvacuationMode.tsx` [MODIFY]
- **Tracking State Machine:** Add logic to manage the user's current environment state (`OUTDOOR` vs `INDOOR`).
- If `OUTDOOR`: Use `Location.watchPositionAsync`. If distance to any `ENTRANCE` is < 2 meters, start the Wi-Fi watcher.
- If `INDOOR`: Stop the GPS watcher (to save battery and prevent visual jumping). Rely purely on the Wi-Fi background watcher and the Pedometer/Gyroscope. If the user hits a `FIRE_EXIT` node and the Wi-Fi signal subsequently vanishes, switch back to `OUTDOOR` mode.
