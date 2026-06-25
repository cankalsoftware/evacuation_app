# Walkthrough: Phase 27 - Redesign Calibration Walk UX

The Calibration Walk workflow has been entirely overhauled to provide a clear, visual, and highly accurate experience for mapping Wi-Fi coordinates to the indoor blueprint.

## Summary of Changes

1. **Interactive Blueprint Integration**
   - The Calibration Walk now completely replaces the previous generic fallback map with your uploaded **Custom Blueprint Map**.
   - It supports full pan, zoom, and pinch gestures exactly like the main Admin Dashboard map editor.

2. **Visual Wi-Fi Tracking**
   - When you press **Capture Here**, instead of just showing a text counter, the system immediately drops an orange Wi-Fi pin directly onto the center of the blueprint you are currently looking at.
   - You can visibly see every Wi-Fi fingerprint you've captured mapped out across the floor plan.

3. **Precise Pin Placement (D-Pad Navigation)**
   - We integrated the exact same **Navigation D-Pad** used for the Exit and Entrance doors into the Calibration Walk.
   - Once a pin drops, it becomes active. You can use the D-Pad to slide the pin perfectly into the corner or room you are standing in.
   - You must hit the **Green Checkmark** to lock the pin before you can capture another one or finish the walk, guaranteeing no accidental misplacements.

4. **Data Synchronization**
   - The Convex database schema and mutations were updated to store the precise relative image coordinates (`x` and `y`) alongside the Wi-Fi signal data. This perfectly binds the ambient Wi-Fi environment to the graphical map coordinate.

## Verification
- Go to the Calibration Walk.
- Press **Capture Here**. Notice a pin drops in the center of the map.
- Notice the D-Pad appears. Nudge the pin to a new location.
- Press the green checkmark to confirm it.
- Press **Finish** and confirm the exact coordinates are stored securely.

5. **Fix for Map Editor V2 Pins Hydration**
   - Fixed an issue where the `selectedBuilding` local state was not updating when saving Map Editor Step 2 configurations.
   - When users closed and immediately re-opened the map, or switched tabs, their previously saved Entrance and Fire Exit pins would not render because the front-end was using stale data.
   - The UI state now seamlessly updates and re-renders the `doorPins` when saved and accessed again.

## Task List

- [x] Copy implementation plan to docs folder
- [x] Update `AdminCalibrationWalk.tsx` map logic
  - [x] Add pan/zoom state variables (zoom, panOffset, imgLayout, etc.)
  - [x] Add map interaction handlers (touch start/move, image bounds calculation)
  - [x] Replace standard MapView with custom Image floor plan
- [x] Implement Wi-Fi Pin Capture
  - [x] Update `captureFingerprint` to drop an active pin at the center of the current screen view
  - [x] Support `x` and `y` coordinates in the `fingerprints` array
- [x] Add Navigation D-Pad
  - [x] Render captured pins on the map
  - [x] If a pin is active, show the D-Pad to nudge it
  - [x] Handle `nudgePin` logic (updating state correctly)
- [x] Ensure backend mutation receives `x` and `y`
- [x] Verify changes
- [x] Create walkthrough artifact
- [x] Fix Map Editor Step 2 bug where previously set pins are not showing when reopening the map Editor
