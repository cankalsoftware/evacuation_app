# Phase 5: Image Ingestion Engine

## Objective
Capture the hotel room evacuation plan using the device's native camera or photo library. We will use `expo-image-picker` to securely handle the image capture flow, then present the image back to the user for confirmation. 

## Features

### 1. Dependencies and Permissions
- **Library**: `expo-image-picker` has been installed.
- **Target**: `app.json`
- **Action**: Add strict camera (`NSCameraUsageDescription`) and photo library (`NSPhotoLibraryUsageDescription`) permissions. This is required so iOS and Android allow the app to access the camera securely without crashing.

### 2. UI: Plan Scanner Modal
- **Target**: `components/PlanScannerModal.tsx`
- **Action**: Create a new modal dedicated to capturing the floor plan.
- **Initial State**: Presents two large buttons: "Take Photo" and "Choose from Gallery".
- **Capture Flow**: Launches the native camera UI or photo picker UI.
- **Preview State**: Once captured, displays a full-screen preview of the floor plan so the user can verify it is legible.
- **Confirmation**: Two buttons appear: "Retake" or "Confirm Plan".

### 3. Integration with Guest Dashboard
- **Target**: `components/GuestDashboard.tsx`
- **Action**: 
  - Wire up the large amber "Scan Plan" button to open the `PlanScannerModal`.
  - When the user taps "Confirm Plan" in the modal, we will hold the image URI in memory and change the dashboard's "Scan Plan" button from Amber to Green, confirming it is ready for AI processing.

## Next Steps
Once you approve this UI flow, I will build out the UI and wire it up to the Amber "Scan Plan" button. After we confirm the image is successfully loading into the app, we will tackle the actual AI analysis and escape plan generation.
