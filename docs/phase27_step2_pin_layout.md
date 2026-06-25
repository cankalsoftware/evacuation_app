# Phase 27: Redesign Map Editor Step 2 (Pin-based Layout)

This implementation plan outlines the overhaul of Map Editor Step 2 specifically for the **V2 workflow (Safe Route Mapping)**. We will completely replace the legacy Grid painting system with an intuitive, precision Pin-placement interface featuring 4 distinct pin types.

## Core Strategy: The 4 Pin Types
1. **Building Pins (Green):** Carried over from Step 1 calibration. These define the building boundaries.
2. **Entrance Pins (Blue):** Dropped manually by the admin in Step 2.
3. **Fire Exit Pins (Red):** Dropped manually by the admin in Step 2.
4. **Safe Path Pins (Orange/Yellow):** Collected automatically during the Wi-Fi Calibration Walk. These map the internal safe routes leading to the exits.

## 1. Database & State Management
- We will bypass the `gridPaths` state entirely.
- We will add a new `doorPins` array to the `buildings` schema:
  `doorPins: v.optional(v.array(v.object({ x: v.number(), y: v.number(), type: v.string() })))`
- The Safe Path pins are already stored securely in the `wifiFingerprints` table with `lat`, `lon`, and `nodeType`.

## 2. Map Editor UI (V2 Mode Only)
- **Remove Grid UI:** For V2, the grid overlay, grid size controls, and "Grid Strategy" instructional texts will be completely removed.
- **Reference Pins:** We will fetch the `imageCalibrationPoints` (Building boundary corners set in Step 1) and display them statically on the Step 2 map as **Green Pins**. These provide the spatial parameters for the admin to place doors within.

## 3. Precision Pin Placement (Step 1 Parity)
- **Shared Navigation Tool:** The exact navigation/magnifier tool used in Step 1 (the D-pad with the green checkmark in the middle) will be fully ported to work in Step 2.
- **Placement Flow:**
  1. Admin selects `Entrance` (Blue) or `Fire Exit` (Red) from the top toolbar.
  2. Admin taps on the floor plan image to drop a provisional pin.
  3. The Navigation Tool (D-pad) appears, allowing the admin to tap the arrows to micro-adjust the pin's position.
  4. The Admin clicks the **Green Checkmark** in the center of the navigation tool to confirm and lock the pin's precise position.

## Verification Plan
1. Enter Map Editor -> V2 Mode -> Step 2. Verify that no grids or grid controls are visible.
2. Verify that Step 1 boundary pins appear in Green.
3. Select `Entrance`, drop a pin, use the navigation D-pad to adjust it, and click the green checkmark to save a Blue pin.
4. Select `Fire Exit`, drop a pin, adjust it, and click the green checkmark to save a Red pin.
5. Save the configuration and verify the pins persist in the database under the new `doorPins` structure.

