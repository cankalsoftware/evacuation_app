# Bug Fix: "I Am Safe" Button and Location Synchronization

## Completed Changes

- **Fixed "I AM SAFE" state bug:**
  - When users tapped the "I AM SAFE" button after physically leaving the building, the mobile app pushed a one-time "SAFE" status to the server but failed to update its local memory. 
  - Because the app runs an auto-ping every 5 seconds, it immediately overrode the server with an "IN_BUILDING" status again on the very next ping. This caused users to snap right back into the *Inside* list despite tapping the button.
  - Replaced the inline function with `markAsSafe` to permanently switch the user's local state to "SAFE", guaranteeing the list updates stay preserved.

- **Synchronized Polygon Margin Logic:**
  - The Admin Dashboard's 5-second scanner (`LiveRollCall.tsx`) was checking for out-of-bounds users using a **strict** bounding box.
  - The mobile app's background GPS checker (`EvacuationMode.tsx`) and the backend (`portal.ts`) use a **5% margin allowance** to prevent GPS drift from causing fake out-of-bounds alerts.
  - This created a conflict where the Admin Dashboard would move a user to the *Outside* list, and the mobile app would instantly pull them back to the *Inside* list. 
  - Updated the Admin Dashboard scanner algorithm to include the exact same 5% margin math (using `distanceToLineSegment`), completely eliminating the rubber-banding conflict.

You should now see the Admin dashboard reliably refresh and migrate users permanently to the *Outside* database when they leave the bounds or click the Safe button.
