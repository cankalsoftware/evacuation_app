# Phase 6 Implementation Plan: Active Evacuation Guidance (Final v2)

This plan outlines the technical execution to build the active Dead Reckoning & Compass navigation system we discussed, incorporating automated image extraction and intelligent compass coloring to maximize safety during panic.

## Goal
To implement a "Panic / Evacuate Mode" for guests that uses the device's live Compass heading to orient the user on their uploaded floor plan, paired with voice-guided prompts. Furthermore, we will use AI Vision to automate the data entry, and color-code the navigation arrows to prevent wrong-way travel.

## Proposed Changes

### 1. Dependencies & Permissions
- **[INSTALL]** `expo-speech` to provide text-to-speech voice commands during the evacuation.
- **[MODIFY]** We will leverage `expo-location` (already installed) using `watchHeadingAsync()` which provides a highly calibrated, tilt-compensated compass heading.

### 2. Database Schema & API (`convex/schema.ts`, `convex/portal.ts`)
- **[MODIFY]** Update the `plans` table to include `roomNumber` and `floorLevel` (both optional strings) so we know exactly where their "You Are Here" anchor is.
- **[NEW ACTION]** Create a Convex server `action` that passes the uploaded image URL to an AI Vision model (like Gemini Vision). The AI will scan the text in the image, locate the "You Are Here" marker, and extract the Room Number and Floor Level.
- **[MODIFY]** Update `uploadScannedPlan` to accept and save these fields upon user confirmation.

### 3. Guest UI - AI Data Capture (`components/GuestDashboard.tsx`)
- **[MODIFY]** After the user uploads an image, the app will instantly call the backend Vision Action to read the map.
- **[MODIFY]** Instead of an empty form, a confirmation modal will pop up with the fields *pre-populated* by the AI (e.g., "We detected you are in Room 204 on Floor 2. Is this correct?").
- The user simply taps "Confirm" (or corrects it if the AI made a mistake).

### 4. Active Navigation UI (`components/EvacuationMode.tsx` - NEW)
- **[NEW]** Create a dedicated, highly visible component for the active emergency state.
- **[FEATURE]** **The Map Viewer:** Displays the user's uploaded floor plan image.
- **[FEATURE]** **Intelligent Compass Overlay:** Uses `Location.watchHeadingAsync()` to render a rotating arrow overlay on the screen. 
  - **Green Arrow:** If the user is facing the correct direction of the safe exit route.
  - **Red Arrow:** If the user turns around and faces the opposite (wrong) direction, the arrow immediately turns RED to explicitly warn them they are going the wrong way, while pointing backward toward the correct route.
- **[FEATURE]** **Voice Commands:** Uses `Speech.speak()` to announce directions and warnings (e.g., "You are going the wrong way. Turn around.")

## Verification Plan
1. Ensure the Gemini AI Vision action successfully extracts Room/Floor text from sample maps.
2. Test the scan flow to ensure the confirmation modal correctly pre-populates and saves to the backend.
3. Test the Evacuation mode to ensure the compass heading updates smoothly, changes color from Green to Red based on orientation thresholds, and the voice engine speaks aloud.
