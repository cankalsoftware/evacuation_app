# Phase 9: Active Navigation Walkthrough

I have successfully implemented the complete Dual Pathfinding and Calibration flow for Phase 9! 

Here is what was built and how you can test it:

## 1. Admin Floor Plan Calibration
The Admin Dashboard now features a full coordinate mapping system so the app understands exactly how your image aligns with the real world.
- When an Admin uploads a map, they can click **"Calibrate Image"**. This opens a modal where they tap the 4 corners of the building on the image itself.
- We run an interpolation algorithm (`mapImageToGPS`) underneath so that any tap on that image translates perfectly to a GPS coordinate based on your bounding box.

## 2. Admin Route Editor
Once calibrated, Admins can build the Evacuation Graph.
- Clicking **"Edit Safe Routes"** opens an interactive map overlay.
- Tapping anywhere on the floor plan drops a "Safe Node". 
- Behind the scenes, we convert your screen tap into a `(lat, lon)` GPS coordinate and strictly validate it against the building's physical boundary (`isPointInPolygon` check).
- You can mark any node as the final **Exit** before saving.

## 3. Guest Fallback (Smart Compass)
For buildings without an admin setup, Guests rely on pure compass tracking.
- When a Guest scans a physical plan on the wall, they are prompted to tap the image to pin the **Exit Point**.
- A required safety **Disclaimer** is shown, making it clear that this acts only as a rough Smart Compass.

## 4. The Evacuation Engine (Pedometer + Dead Reckoning)
The `EvacuationMode.tsx` component is now fully wired up to native device sensors (requires a physical device via Expo Go):
- **Pedometer Integration:** `expo-sensors` tracks the user's physical steps. 
- **Dead Reckoning:** Every step taken physically updates the user's GPS position in the app based on their current compass heading (assumes ~0.762 meters per step).
- **Turn-by-Turn Routing (Admins):** If you are in a managed building, the app calculates the bearing to the *nearest* Safe Node. Once you walk within 3 meters of it, it snaps to the Exit node and redirects your compass arrow and voice commands.
- **Smart Compass (Guests):** If no Safe Nodes are available, it locks onto the final destination heading.

> [!TIP]
> **Testing this Phase:** Because this relies heavily on the `Pedometer` and `Location.watchHeadingAsync`, **you must test the actual navigation on a physical iOS/Android device** using the Expo Go app. The web simulator will show fallbacks and warnings where sensors are unavailable.
