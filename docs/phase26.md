# Phase 26: Indoor Coordinate Accuracy Enhancement

The primary motivation for this phase is that standard GPS fails indoors, blocking our ability to thoroughly test the app and delaying the Google Play Store deployment. By implementing our own custom indoor positioning engine, we can bypass Google Maps' indoor limitations and achieve the precision needed for a true emergency evacuation tool.

## Preservation of Existing Emergency Features

It is strictly required that while we overhaul the underlying coordinate generation engine, the **User Interface and Emergency Features remain completely intact**. The new tracking engine will simply feed higher-accuracy coordinates into the existing system so that:
1. **Arrow Guidance:** The dynamic compass arrow pointing the user to the Safe Zone must continue to work flawlessly.
2. **Wrong Direction Audio:** The audio alerts that warn users if they are moving away from the Safe Zone will be preserved.
3. **Panic Siren:** The loud SOS siren button to attract attention must remain fully operational.

## Chosen Technology Strategy: Hybrid Sensor Fusion + AR Fallback

Based on your feedback, we will implement a multi-layered Hybrid System. It combines background Pedestrian Dead Reckoning (PDR) with active Wi-Fi Fingerprinting and an intelligent AR Camera Fallback mode.

### 1. Admin Building Registration & Setup 
During the building setup phase, Admins will have a new step to enhance map coordinates:
- **Wi-Fi Fingerprint Walk-Through:** We will add a "Calibration Walk" tool in the Admin Dashboard. As the Admin walks the floor plan, the app will scan surrounding Wi-Fi routers (BSSID + RSSI) and permanently map them to physical coordinates on the floor plan. This ensures 100% accuracy without beacon hardware.
- **IMDF Registration Guide:** We will provide an optional prompt inside the app encouraging Admins to register their floor plans with Apple Business Connect and Google Maps. 
  - *Warning included:* We will notify them that this process can take weeks to be approved by Apple/Google, but once approved, it unlocks native high-precision OS-level indoor mapping.

### 2. Guest Evacuation Tracking (The Background Engine)
When an emergency triggers:
- **The Entry Fix:** The app captures the highly accurate outdoor GPS fix just before the user enters the building or loses signal.
- **Pedestrian Dead Reckoning (PDR):** Using the device's accelerometer and compass, the app continuously tracks step counts and direction to estimate relative movement.
- **Wi-Fi Zone Snapping:** In the background, the app scans Wi-Fi BSSIDs and cross-references them against the Admin's "Calibration Walk" database. It then feeds this "snapped" location directly into the existing `EvacuationMode` state to power the arrows and audio warnings.

### 3. AR Camera Fallback (The Foreground Engine)
If a user is lost or needs extra help:
- **Tilt Detection:** Using the device's gyroscope, we will detect if the user lifts their phone into an upright "viewing" position.
- **AR Overlay Activation:** When upright, the map UI will transition into an Augmented Reality (AR) camera view. 
- **Hybrid Guidance:** Even if smoke or obstacles block visual feature points, the underlying Wi-Fi/PDR engine will overlay directional arrows (e.g., "Turn Left in 5 meters") onto the camera feed, guiding them to safety.

## Proposed Code Changes

1. **[NEW] `components/AdminCalibrationWalk.tsx`**
   - A modal for Admins to initiate a Wi-Fi scan while walking through their building.
2. **[MODIFY] `convex/schema.ts`**
   - Add a `wifiFingerprints` table to store `{ buildingId, bssid, lat, lon, signalStrength }`.
3. **[MODIFY] `components/AdminDashboard.tsx`**
   - Add the Calibration Walk trigger and the Apple/Google IMDF Registration prompt/warnings.
4. **[MODIFY] `components/EvacuationMode.tsx`**
   - **Critical check:** Ensure the new Hybrid Coordinates seamlessly update the existing `distanceToSafeZone` and `targetHeading` variables so the arrow and wrong-direction audio continue to function.
   - Implement gyroscope monitoring (using `expo-sensors`) to detect "upright" device positioning.
   - Trigger the `expo-camera` AR overlay mode.
   - Implement the Wi-Fi BSSID scanner (using `expo-network` or custom Native Modules) to cross-reference Convex for location snapping.

## Next Steps

Please review the finalized implementation plan with the preservation checks added. If everything looks exactly as you envisioned, approve this plan and I will begin the development of Phase 26!
