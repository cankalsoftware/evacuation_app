# Phase 7 Completed: Guest Geo-Anchoring

We've successfully upgraded the Guest Application from a purely manual scanning application to a proactive, context-aware experience.

## What Was Done

### 1. The Math Engine
I deployed a standard mathematical Ray-Casting algorithm inside Convex (`isPointInPolygon` in `convex/portal.ts`).
This allows the server to verify whether a GPS coordinate falls strictly inside the perimeter of any building's polygon outline, regardless of whether the outline is a square, L-shape, or complex W-shape.

### 2. Auto-Push Query
The server now exposes `getAutoPushedBuilding`, a reactive query that accepts live GPS coordinates. It scans through all admin-defined buildings in the database and returns a match if the user is inside one.

### 3. Guest Dashboard Overhaul
The `GuestDashboard` has been wired to continuously monitor the device's location and ping the backend.
- **Priority Override**: If the user steps inside a known polygon, the system automatically bypasses the 50m manual photo check and instantly places the user into "Verified" mode (`isScanned = true`).
- **UI Feedback**: The primary action button now boldly displays "Auto-Connected: [Building Name]" to let the user know they are receiving official data.
- **Evacuation Hand-off**: When they smash the Panic Button, the Admin's Master Floor Plan is dynamically injected into the active `EvacuationMode` session.

### 4. Admin UI Upgrades
- **Mandatory Image Uploads**: The "New Building" flow now strictly forces Admins to pick and upload a Master Plan image before they are allowed to save the building to the database. This guarantees that Guests will always have a map to download when they enter the Geo-Fence.
- **Safety Rails**: Integrated a mathematical line-intersection algorithm into the Admin Dashboard. If the Admin accidentally draws criss-crossing lines (a "bowtie" shape), the UI instantly throws a warning and disables saving to prevent the backend from breaking.

## Verification Required
To see the Magic in action, please try the following:
1. Open the Admin portal on your browser and verify you have drawn a Polygon around a location on the map.
2. Sign in as a Guest. 
3. Open **Chrome DevTools (F12)** -> **Three Dots (Top Right)** -> **More Tools** -> **Sensors**.
4. In the Sensors tab, override your **Location** coordinates to match a spot exactly inside the polygon you drew in Step 1.
5. The UI should instantly snap to "Auto-Connected" mode!
