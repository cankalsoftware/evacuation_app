# Redesign Calibration Walk UX

The current `AdminCalibrationWalk.tsx` captures Wi-Fi fingerprints via GPS but simply displays a banner saying "X Wi-Fi Points Captured" when using a custom floor plan. This leaves the admin blind as to where the system thinks the points are, and offers no way to correct them.

## Goal
Make the Calibration Walk clear and intuitive by rendering the captured Wi-Fi points directly on the building's custom floor plan and allowing the admin to manually correct/place them using the same navigation tool (D-Pad) as the Map Editor.

## Proposed Changes

### `AdminCalibrationWalk.tsx`

1. **Replace Static Image with Interactive Map**
   - Import and integrate the pan/zoom map logic (similar to `AdminDashboard.tsx`) so the admin can navigate the custom floor plan during the walk.
   - Remove the fallback Google `MapView` logic to fully commit to the custom floor plan visualization.

2. **Visualizing Captured Points**
   - Render the `fingerprints` array as pins (e.g., orange Wi-Fi icons) on the map.
   - When "Capture Here" is pressed, a new fingerprint is recorded. Since raw GPS might be inaccurate indoors, we will spawn the new pin at the center of the currently viewed map area.

3. **Interactive Pin Placement (D-Pad)**
   - When a pin is spawned or tapped, it becomes the "active" pin.
   - Display the familiar Navigation D-Pad (Up/Down/Left/Right/Confirm) to allow the admin to precisely nudge the pin to their exact physical location on the floor plan.
   - The admin presses the green checkmark to lock the pin's location.

4. **Data Structure Updates**
   - Update the `fingerprints` array to store `x` and `y` relative image coordinates (0.0 to 1.0) alongside the physical GPS and Wi-Fi data.
   - Ensure these `x` and `y` coordinates are sent to the `saveWifiFingerprints` mutation so the exact floor plan position is permanently saved.

## Open Questions
- Do you want the pins to default to the center of your screen when you hit "Capture", or should we attempt to estimate their position using the raw GPS coordinate before you manually correct them? (Defaulting to the center of the screen is usually much more reliable indoors where GPS bounces).
- Should we restrict saving the calibration walk until ALL captured pins have been explicitly confirmed (green checkmark clicked)?
