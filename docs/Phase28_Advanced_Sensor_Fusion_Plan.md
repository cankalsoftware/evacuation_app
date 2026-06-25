# Phase 28: Advanced Sensor Fusion, Map Snapping, & Multi-Floor Navigation

This plan details the implementation of advanced indoor positioning features designed to correct dead-reckoning drift, lock paths to the building layout, and track multi-floor evacuations without relying entirely on Wi-Fi infrastructure. 

*Updated based on user feedback to include multi-floor map switching, strict grid snapping, and dynamic hazard routing.*

## User Review Required
> [!IMPORTANT]
> Because `Barometer` (altimeter) readings fluctuate based on daily weather (air pressure), we cannot use absolute pressure to know the floor. Instead, we must capture a "Baseline Pressure" the exact moment the user enters the building. This requires the assumption that the app knows what floor the user is on when they enter the building.

---

## Proposed Changes

### 1. Multi-Floor Navigation & Automatic Map Switching
When a user changes floors (detected by the altimeter), the Map View must automatically switch to the correct floor plan.
- **Backend Updates:** Review the building map upload feature to ensure maps are properly associated with specific floor numbers (1, 2, 3, etc.).
- **Altimeter Tracking:** Start a `Barometer.addListener()` when `envState` becomes `"INDOOR"`. Store the baseline pressure.
- **Floor Change Logic:** A pressure change of ~0.4 hPa indicates a floor change. When triggered, update the UI to display the new floor's map and load that floor's specific `gridPaths` and `doorPins`.
- **Stairwell Mode:** If the user enters a stairwell and begins descending, the app will enter "Stairwell Mode". It will track them continuously down the stairs, updating their current floor, until they exit the stairwell on the ground floor.

---

### 2. Strict Map Snapping (Map Matching)
To ensure users follow the absolute safest route, we will strictly lock their live location to the predefined Safe Paths drawn by the admin.
- **Logic:** After calculating the new step location via Dead Reckoning, find the nearest grid point (or line segment between grid points) from the Safe Route. Project (snap) the user's coordinates directly onto that segment.
- **Strict Adherence:** The blue dot will not be allowed to drift freely into open rooms; it will remain strictly tethered to the designated path.

---

### 3. Dynamic Hazard Rerouting
During an evacuation, a previously safe path may become blocked (e.g., by fire or smoke). Users need the ability to report this, triggering an immediate route recalculation.
- **Hazard Reporting:** Allow users to mark their current path as "Unsafe" during an evacuation.
- **Shortest-Path Re-adoption:** If the user is forced off the snapped grid path due to a hazard, the routing algorithm will instantly calculate the shortest possible route to reconnect them to the next closest Safe Path grid node, bypassing the blocked area.

---

### 4. Advanced Heading Correction (Compass + Gyro Fusion)
Currently, `EvacuationMode.tsx` uses standard heading which can be jittery indoors. We will import `Magnetometer` and `Gyroscope` from `expo-sensors` to build a **Complementary Filter**.
- **Gyroscope:** Provides high-frequency (50Hz) relative turn angles (smooth but drifts over time).
- **Magnetometer:** Provides low-frequency absolute North (jittery indoors but never drifts).
- **Fusion Math:** `Heading = (0.98 * (Heading + GyroData)) + (0.02 * MagnetometerData)`
- **Implementation:** Update step tracking to use this smoothed, fused heading vector to prevent the dead-reckoning trajectory from drifting before it gets snapped to the grid.

---

## Verification Plan

### Automated/Mathematical Verification
- Log the Complementary Filter outputs vs Raw Compass outputs to verify the smoothing effect is working.
- Hardcode fake pressure drops to simulate a user running down the stairs and verify that `currentFloorOffset` increments correctly and triggers the Map switch.

### Manual Verification
- **User Testing:** Walk down a real hallway with the phone angled incorrectly. The Strict Map Snapping algorithm should keep the blue dot locked perfectly on the hallway line.
- **Dynamic Rerouting Test:** While evacuating, manually block the path. Verify the app correctly breaks the snap, directs the user via the shortest path to an adjacent safe route, and resumes strict snapping.
- **Stairwell Test:** Walk up or down a flight of stairs. The barometer should register the change, trigger "Stairwell Mode", and automatically load the floor plans sequentially as the user descends.
