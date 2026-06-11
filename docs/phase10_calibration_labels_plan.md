# Goal Description

The current mapping between the 4 GPS polygon pins and the 4 image calibration points is confusing, because they are just labeled P1, P2, P3, and P4. The goal is to allow Admins to assign intuitive labels (like Top-Left, Bottom-Right) to the GPS pins, and then explicitly use these labels during the Image Calibration step so the Admin knows exactly which corner of the image they are tapping.

## Open Questions

- **Default Labels**: For the first 4 pins, I propose defaulting to `Top Left`, `Top Right`, `Bottom Right`, and `Bottom Left` in that order. Does this sound good?
- **UI Interaction**: In the Calibration modal, we can list the 4 labeled pins. You tap a pin from the list, then tap the image to assign its pixel coordinate. This way you can do them in any order. Does this match your "select and point to the map" idea?

## Proposed Changes

### convex/portal.ts

- **Modify Schema**: Update `saveBuilding` and `updateBuildingPolygon` arguments to accept a `label` string inside the polygon point object.
  ```typescript
  polygon: v.optional(v.array(v.object({ 
    lat: v.number(), 
    lon: v.number(), 
    label: v.optional(v.string()) 
  })))
  ```

### components/AdminDashboard.tsx

- **Manual Coordinate Editor**: Add a text input next to each GPS coordinate to allow editing its `label`.
  - When pins are generated (e.g. from tapping the map or generating test pins), automatically assign the default labels: "Top Left", "Top Right", "Bottom Right", "Bottom Left" for the first 4.
- **Image Calibration UI**: 
  - Change the UI to show a list of the 4 labeled GPS pins.
  - The admin selects a label (e.g. "Top Left"), then taps the image to place the calibration marker for that specific corner.
  - Show the labels directly on the image markers (e.g. "TL") so it's visually obvious.

## Verification Plan

- Run `pnpx convex dev` to ensure the schema updates compile.
- Test the Admin Dashboard: Create a new polygon, verify the default labels appear in the Manual Editor. Edit a label.
- Open Calibration: Verify the UI prompts the user to place the specific labeled pins on the image.
