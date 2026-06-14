# Phase 18: Raster Grid Layout and A* Routing Implementation

## 1. Overview
In this phase, we transitioned from a topology-based manual node mapping system to a **5x5m continuous raster grid system**. Instead of dragging individual safe points and linking them manually, the admin now "paints" continuous safe zones and exits directly over the scaled master plan image using their finger or mouse.

This approach massively simplifies the admin workflow and perfectly guarantees seamless safe route coverage, as the pathfinding algorithm can dynamically navigate across any adjacent painted cell.

## 2. Core Features Implemented

### 2.1 Dynamic Map Layout & Scaling
- The `AdminDashboard` automatically sizes the map to fit optimally on any screen without overflowing.
- Map size limits (`getDynamicMapHeight`) dynamically cap the container height to 65% of the viewport height.
- We implemented a precision alignment algorithm that crops away the white margins of the raw image, automatically zooming into the building boundary limits based on the Phase 1 GPS calibration points.

### 2.2 Pan & Zoom Tools
- **Phase 1 (Calibration) & Phase 2 (Safe Routes)** both support full zoom functionality (up to 500%) to allow precise pin placement and cell painting on mobile or desktop devices.
- A **Pan Mode** allows the user to drag the image around when zoomed in, while disabling the Pan tool instantly re-locks the map so the user can easily paint cells without the map sliding away.

### 2.3 The "Paint" System
- Admins can toggle between **🟦 Safe** and **🚪 Exit** brushes.
- Touching or dragging on the map converts the absolute pointer location into GPS coordinates using the boundary limits.
- The map is internally partitioned into a logical grid where each cell corresponds to roughly 5x5 meters in physical space.
- A **🧹 Erase** brush allows admins to delete incorrectly placed cells. (Note: dragging over the same cells with the "Safe" brush does not toggle them; erasure requires explicitly using the Erase tool).

### 2.4 Data Model Updates
- Added `gridPaths` (an array of grid coordinates and Exit flags) to the Convex `buildings` schema.
- Built a convex mutation `updateBuildingGridPaths` to commit the drawn path layer directly to the database.

## 3. Pathfinding Implications
Because all paths are simply continuous adjacent grid coordinates, the routing component (Phase 16) relies on a pure **A* search algorithm**. As long as the user paints an unbroken chain of blue cells connecting the center of the building corridors to the green exits, the routing algorithm calculates the physical shortest path through adjacent painted grid cells avoiding impassable walls natively.

## 4. Verification Check
- **Zooming:** Successfully tested scaling coordinates symmetrically in `rawX` and `rawY` pixel computations.
- **Painting:** Tapping on a spot accurately renders a scaled rectangle representing the 5m physical bounding box, adapting to any screen's layout dimensions correctly.
- **Data Save:** Successfully saving the raster `gridPaths` layout to the cloud database.
