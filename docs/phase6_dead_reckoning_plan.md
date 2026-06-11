# Phase 9: Active Navigation (Pedometer & Pathfinding)

We are picking up the remaining tasks from Phase 6, specifically the "Dead Reckoning" (Pedometer) tracking and the actual Convex Pathfinding logic. 

Based on your feedback, we will avoid AI-extracted routes and instead rely on a **Dual Pathfinding Strategy** that separates Admin-managed buildings from Ad-Hoc Guest scans.

## Proposed Strategy

### Scenario A: Admin-Managed Buildings (High Accuracy)
When an Admin registers a building and uploads the Master Plan, they must mathematically anchor the image to the real world to enable high-accuracy tracking.

1. **GPS Polygon Definition:** Admin drops GPS pins on the map to define the building's physical footprint (Already Completed).
2. **Image Calibration (NEW):** Admin taps the corners on the uploaded 2D Master Plan image that correspond to the GPS pins they just dropped. This allows us to calculate the exact scale, rotation, and translation to perfectly merge the 2D image with real-world GPS coordinates.
3. **Route Definition:** Admin taps the calibrated Master Plan image to define **Safe Route Turning Points** (corridor corners) and the final **Exit Point**.
4. **Boundary Validation (NEW):** The system automatically checks if the defined turning points and exit fall *inside* the established building polygon. If not, the admin receives an error.
5. **Navigation:** When a Guest triggers an evacuation inside this building, the app will use their starting position to find the *nearest turning point*. It will then guide them Turn-by-Turn along the safe route nodes until they reach the exit.

### Scenario B: Guest Manual Scan (Direct Compass)
When a Guest is in an unregistered building, they can scan the plan manually.

1. **Exit Pinning:** During the manual upload, the Guest will be asked to tap the image to pin the **Exit Point**.
2. **Disclaimer:** A warning will be shown stating: *"Manual scans provide basic compass direction. For accurate turn-by-turn guidance, ask your building manager to register on FireVision. Use at your own risk."*
3. **Navigation:** When the panic button is pressed, the app will act as a smart compass. It will use Dead Reckoning to point them directly toward the Exit Point, but the user must figure out how to navigate the physical hallways themselves.

## Technical Implementation Plan

### 1. Database Schema
#### [MODIFY] `convex/schema.ts`
- **`buildings` table:** 
  - Add `imageCalibrationPoints: v.optional(v.array(v.object({ x: v.number(), y: v.number() })))` to map image pixels to the GPS polygon.
  - Add `safeNodes: v.optional(v.array(v.object({ lat: v.number(), lon: v.number(), isExit: v.boolean() })))` to store the Admin's verified turning points and exit in real-world coordinates.
- **`plans` table (Guest Scans):** Add `exitNode: v.optional(v.object({ x: v.number(), y: v.number() }))` to store the Guest's manually pinned exit.

### 2. Admin UI Updates
#### [MODIFY] `components/AdminDashboard.tsx`
- **Calibration Step:** After defining the GPS footprint, ask the Admin to tap the corresponding corners on their uploaded Master Plan.
- **Route Editor:** Add a "Draw Safe Route" modal for active buildings. Allow the Admin to click the image to drop turning points, and double-click to mark the final Exit point.
- **Validation Math:** Implement the "Point-in-Polygon" algorithm to ensure every node the admin drops falls inside the bounds of the building's GPS polygon before saving to the database.

### 3. Guest UI Updates
#### [MODIFY] `components/GuestDashboard.tsx`
- In the `showConfirmModal` (after they upload a manual scan), display the scanned image.
- Ask the user to tap the image where the Exit is located.
- Add the legal disclaimer about accuracy and risks.
- Save the relative `exitNode` coordinates to the database.

### 4. Evacuation Engine
#### [MODIFY] `components/EvacuationMode.tsx`
- **Pedometer Integration:** Use `expo-sensors` `Pedometer.watchStepCount` to track physical steps.
- **Dead Reckoning Math:** Move the user's "Blue Dot" on the screen based on their compass `heading` and step count.
- **Admin Routing (Turn-by-Turn):** If `autoBuilding` is active, calculate the path to the nearest safe node, update `TARGET_HEADING` dynamically as they pass nodes.
- **Guest Routing (Compass Mode):** If relying on a manual scan, statically set `TARGET_HEADING` to point towards the single `exitNode`.

## Verification Plan

### Manual Verification
- **Admin Flow:** Upload a test building, map the image corners to the GPS pins. Draw 3 turning points and 1 exit. Intentionally draw a node outside the building to verify the boundary validation blocks it. Trigger panic mode and verify the arrow dynamically updates as we "walk" past each turning point.
- **Guest Flow:** Upload a manual map, pin an exit, trigger panic mode, and verify the arrow acts as a static compass pointing toward the exit. Confirm the disclaimer is visible.
