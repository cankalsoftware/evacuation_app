# Walkthrough: Phase 27 - Map Editor Step 2 Pin Overhaul

We have successfully overhauled Map Editor Step 2 for the **V2 Workflow**, completely ditching the legacy grid system in favor of an intuitive, precision pin-placement interface.

## Changes Made
### 1. Database and Backend
- Added a `doorPins` array to the `buildings` schema in `convex/schema.ts` to securely store manual pin locations separately from legacy grid mappings.
- Created an `updateBuildingDoorPins` mutation in `convex/portal.ts` to allow saving pin locations.

### 2. Admin Dashboard UI (V2 Step 2)
- Replaced the Grid drawing interface with a **Dynamic Pin Placement** system.
- Rendered existing **Building Boundary Pins (Green)** as static anchor markers so admins know the building boundaries.
- Introduced a new top-level control panel in Step 2 allowing admins to select their **Active Pin Type**:
  - `Entrance` (Drops **Blue** Pins)
  - `Fire Exit` (Drops **Red** Pins)
- Re-used the **Precision Navigation D-Pad** from Step 1. Tapping the map places a new pin and summons the D-Pad, allowing micro-adjustments before locking the position with the Green Checkmark.

### 3. V1 vs V2 Independence
- The grid strategy has been successfully encapsulated within `mapEditorMode === 'v1'`. It behaves exactly as it did before.
- For `v2`, all grid artifacts (the grid layout box, "Grid Strategy" hints, and clear grid buttons) are completely suppressed. The map uses `doorPins` rendering exclusively.
- Updated the "Save Configuration" button for V2 to securely commit the `doorPins` state to the database.

## Validation
- Admins can now map physical Entrances and Fire Exits as 2D coordinates on the building blueprint.
- During the upcoming **Start Calibration Walk** phase, we will fetch these saved door pins and interlock them with the Safe Route Pins (which will be generated dynamically during the physical walk and mapped as Orange/Yellow nodes).

