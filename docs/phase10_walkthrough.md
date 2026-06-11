# Phase 10 Walkthrough: Intuitive Calibration Labels

## Summary of Changes

We have completed the implementation to make the GPS Polygon and Image Calibration process much more intuitive. Instead of relying on abstract identifiers like `P1` or `P2`, administrators can now explicitly label the polygon corners, which drastically simplifies the image mapping process.

### 1. Polygon Labeling
- **Convex Schema Update**: The `polygon` array elements now securely accept an optional `label` string.
- **Default Assignments**: When you generate test pins or tap to place the first 4 pins on the interactive map, they automatically default to `Top Left`, `Top Right`, `Bottom Right`, and `Bottom Left`.
- **Manual Coordinate Editor**: You can now edit the labels directly from the Dashboard. These labels save directly alongside the GPS coordinates.

### 2. Revamped Calibration UI
- **Label Selection**: When calibrating the image, you now see a horizontal list of the labels you assigned to the first 4 polygon points. 
- **Tap to Place**: You select a label (e.g., "Top Left"), then tap the specific spot on the floor plan. The marker shows the initialism (e.g., "TL") right on the image.
- **Adjustability**: Because of the selection system, if you miss slightly, you can just tap the image again while that label is selected to *move* the point instead of having to clear and start over!
- **Auto-Advance**: Placing a point automatically selects the next unplaced point in the list for a rapid flow.

## Verification

- [x] Schema validates and `convex dev` compiler passes.
- [x] Web preview generates pins with the correct labels.
- [x] Calibration Modal renders the correct names and places named markers.
- [x] You can adjust a placed calibration point by tapping again.
