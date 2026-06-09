# Profile Settings Feature Plan

## Objective
Replace the inline Guest Dashboard name editor with a robust, full-screen "Profile Settings" modal. This acts as the centralized hub for identity management and location awareness.

## Features

### 1. Database Schema
- **Target**: `convex/schema.ts` and `convex/portal.ts`
- **Action**: Add an optional `phone` string field to the `users` table so we can securely store the user's telephone number alongside their name. Update the `updateProfile` mutation to accept and patch this field.

### 2. UI: Profile Settings Screen
- **Target**: `components/ProfileSettingsScreen.tsx`
- **Identity Fields**:
  - Read-Only Registered Email.
  - Editable Name Input.
  - Editable Telephone Number Input.
- **Location Status**:
  - Live GPS Latitude/Longitude display.
  - Manual "Refresh Location" button to force a new GPS ping.
  - A visual, read-only checkbox stating "Location Tracking Enabled" (since they agreed during the registration consent phase).
  - A subtle link below reading "View Terms and Conditions".

### 3. Integration
- **Target**: `components/GuestDashboard.tsx`
- **Action**: Remove the old inline editor. Clicking the Gear ⚙️ icon will now slide up the new `ProfileSettingsScreen` modal over the dashboard.
