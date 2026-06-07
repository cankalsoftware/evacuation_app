# Phase 6 Implementation Plan: Active Evacuation Guidance

This plan outlines the technical execution to build the active Dead Reckoning & Compass navigation system we discussed, entirely bypassing the need for immediate Admin intervention by letting the user provide their anchor data.

## Goal
To implement a "Panic / Evacuate Mode" for guests that uses the device's live Compass heading to orient the user on their uploaded floor plan, paired with voice-guided prompts and explicit tracking of their Room/Floor number.

## Proposed Changes

### 1. Dependencies & Permissions
- **[INSTALL]** `expo-speech` to provide text-to-speech voice commands during the evacuation.
- **[MODIFY]** We will leverage `expo-location` (already installed) using `watchHeadingAsync()` which provides a highly calibrated, tilt-compensated compass heading.

### 2. Database Schema & API (`convex/schema.ts`, `convex/portal.ts`)
- **[MODIFY]** Update the `plans` table to include `roomNumber` and `floorLevel` (both optional strings) so we know exactly where their "You Are Here" anchor is.
- **[MODIFY]** Update `uploadScannedPlan` to accept and save these two new fields.

### 3. Guest UI - Data Capture (`components/GuestDashboard.tsx`)
- **[MODIFY]** After the user uploads an image, immediately pop up a small modal asking: "What Room Number and Floor is this map located on?" 
- This guarantees we capture the perfect starting anchor coordinates without waiting for an Admin to draw it.

### 4. Active Navigation UI (`components/EvacuationMode.tsx` - NEW)
- **[NEW]** Create a dedicated, highly visible component for the active emergency state.
- **[FEATURE]** **The Map Viewer:** Displays the user's uploaded floor plan image.
- **[FEATURE]** **The Compass Overlay:** Uses `Location.watchHeadingAsync()` to render a rotating arrow overlay on the screen, showing the user exactly which direction their phone is pointing in the real world.
- **[FEATURE]** **Voice Commands:** Uses `Speech.speak()` to announce: *"Evacuation initiated. Orient your phone using the compass arrow and follow the green route on your screen."* (We can add more dynamic step-by-step routing in future phases once the Graph algorithm is built, but this lays the exact hardware foundation).

## Open Questions
> [!IMPORTANT]
> 1. Are you okay with adding a quick pop-up asking for "Room Number" and "Floor" immediately after they scan a map?
> 2. For this initial active view, the compass arrow will show them their real-world heading relative to the phone. Do you want the *Arrow* to rotate while the map stays still, or the *Map* to rotate while the arrow points straight up (like Google Maps driving mode)?

## Verification Plan
- Run `pnpx expo install expo-speech`.
- Verify the Convex schema compiles successfully.
- Test the scan flow to ensure Room/Floor are saved to the backend.
- Test the Evacuation mode to ensure the compass heading updates smoothly and the voice engine speaks aloud.
