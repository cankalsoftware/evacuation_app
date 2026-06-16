# Phase 21: Post-Registration Permissions & Address Expansion

## Goal
To allow users to skip granting Location and Notification permissions during initial registration, while enforcing strict restrictions inside the app until they manually grant those permissions. Additionally, expand the Admin setup form to capture Post Code and Country, and rename the subscription database field.

## Proposed Changes

### 1. Database Schema Updates
- **Users Table:** Add fields to support the Admin address expansion and centralized permission tracking:
  - `postCode: v.optional(v.string())`
  - `country: v.optional(v.string())`
  - `permissionsGranted: v.optional(v.boolean())`
- **Rename Field:** Change `agreedToSubscription` to `agreedToTandC` across `schema.ts`, `users.ts`, `portal.ts`, and the React state in `AdminDashboard.tsx` and `GuestDashboard.tsx`.
- **API `updateAdminProfile`:** Make the new address fields strictly mandatory for Admins during their setup API call.

### 2. Location Consent Screen Update
- Modify `LocationConsentScreen.tsx` so that users are **not blocked** if they deny OS permissions. 
- The screen will no longer return an error that prevents proceeding. It will simply proceed into the app without active OS permissions.

### 3. Dashboard Persistence & Restrictions
If OS permissions (Location & Notifications) are missing when the user loads the dashboard:
- **Top Banner:** A persistent red warning message will appear at the top of the screen: *"You must approve location and notification permissions in settings."*
- **Glowing Settings Gear:** The Settings gear (chark) icon will pulse/glow red to draw the user's attention.
- **Guest Restrictions:** 
  - The "Panic Button" will be disabled.
  - The "Upload Map" feature will be disabled.
- **Admin Restrictions:** 
  - The "Register Building" button will be disabled.
  - The "Add Location" features will be disabled.
- **Settings Modal Update:** Inside the settings modal, we will add clear buttons to manually request OS permissions from the system.

### 4. Admin and Guest Setup Form Modifications
- In `AdminDashboard.tsx`, the setup layout will be updated:
  - Business Address
  - **[NEW]** Registered Post or Zip Code
  - **[NEW]** Country
- Above the Terms & Conditions tickbox, we will list the unified `permissionsGranted` as a checkbox.
- In `GuestDashboard.tsx`, if a Guest has not agreed to T&C, the `ProfileSettingsScreen` is forced open and cannot be closed until they tick the `agreedToTandC` box.
- Both setups use a single tick box to request and verify both Location and Push notifications.

## Verification Plan
1. Check that the schema properly reflects `agreedToTandC`.
2. Launch the app and explicitly deny permissions during sign up.
3. Verify that I can still log in to the dashboard.
4. Verify the glowing gear, the warning message, and that restricted actions are disabled.
5. Go to settings and grant permissions.
6. Verify the warnings disappear and the restricted buttons become clickable again.
