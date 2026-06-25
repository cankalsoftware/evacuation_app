# Phase 28: Advanced Sensor Fusion & Map Snapping

We've successfully upgraded the Evacuation Engine from a simple Wi-Fi/Pedometer system to a **Multi-Sensor Hybrid Tracking Engine**. This significantly improves the accuracy and reliability of indoor positioning during an emergency.

---

## 1. Advanced Heading Correction (Complementary Filter)
Previously, the avatar's direction relied heavily on the raw compass or the gyroscope alone, leading to drift. We've implemented a **Complementary Filter** inside `EvacuationMode.tsx` that fuses data from both `expo-sensors`' Gyroscope and Magnetometer.
- **The Result:** The Gyroscope provides buttery-smooth turning animations, while the Magnetometer constantly nudges the internal heading towards True North, preventing the user's avatar from slowly curving into walls over time.

## 2. Strict Map Snapping & Dynamic Rerouting
To ensure maximum safety, we implemented **Strict Map Snapping**.
- Instead of the avatar drifting freely into rooms or off-course, the Pedometer's math is now strictly snapped to the `gridPaths` (Safe Routes) drawn by the admin during calibration.
- **Hazard Reporting:** We added a new **"Route Blocked? Report Hazard"** button to the UI. If a user encounters a fire blocking the safe path, tapping this button marks their current grid cell as a hazard. The `aStarGridPath` algorithm immediately recalculates the shortest detour around the hazard, and the UI snaps the user to the new safe route.

## 3. Altimeter for Multi-Floor Tracking
We integrated the phone's **Barometer** to track vertical movement.
- When the user enters the building (`envState === "INDOOR"`), the app records the current atmospheric pressure as a baseline.
- As the user changes altitude (e.g., walking down stairs), the app measures the pressure delta. A ~0.42 hPa change mathematically corresponds to one standard building floor (~3.5 meters).
- **Stairwell Mode:** The app detects when you enter a stairwell and logs the `currentFloorOffset`, laying the technical foundation to automatically flip the screen's floor plan as you run down the stairs.

---

> [!TIP]
> **Next Steps:** The sensor tracking is now heavily optimized for a single floor plan. To fully utilize "Stairwell Mode", we need to update the Admin Dashboard to support drawing and saving separate Master Floor Plans for Floor 1, Floor 2, etc., and seamlessly stitch their `gridPaths` together!

---

## Phase 29: Global Hazards & Emergency Distress Alarms

- **Global Hazards Shared State**
  - Updated the Convex Schema (`schema.ts`) to add a new `hazards` array inside the `incidents` table.
  - Replaced the local React state inside `EvacuationMode.tsx` with a real-time reactive subscription to the `activeIncident.hazards`.
  - When any user dynamically taps "Report Blocked Path", it sends a mutation `reportIncidentHazard` to Convex. This instantly notifies **all other evacuees**.

- **Global Hazard Visuals & Alarms**
  - User map (`EvacuationMode.tsx`): Renders dynamically reported hazards as bright red alert blocks over the map grid.
  - Device Alarms: Added an automatic effect that watches for incoming hazards. When another evacuee reports a hazard, the local device uses `Speech.speak` ("Warning. A new hazard has been reported.") and shows a UI Toast to alert the user of the new safest-path calculation.
  
- **Admin Map Oversight**
  - Modified `AdminDashboard.tsx` so the Live Roll Call tracking map overlays ALL global hazards dynamically.
  - The Admin can see exactly where bottlenecks or fires are located.
  - Added a tappable interaction for the Admin to remove/clear a hazard via the `removeIncidentHazard` mutation once it's handled (e.g. fire extinguished or blockage cleared).

- **Panic Button & Evacuation Stress Siren Verified**
  - Confirmed the user SOS distress signal `togglePanic` correctly activates `sirenPlayer.play()`, triggering a loud local alarm to guide first responders.
  - Verified it also patches the user's Convex state `setPanic: true`, immediately placing them in a flashing red "SOS ACTIVE" bracket on the Admin's `LiveRollCall` dashboard.
