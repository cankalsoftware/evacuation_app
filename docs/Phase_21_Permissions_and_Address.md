# Phase 21: Post-Registration Permissions & Address Expansion

## Goal
To allow users to skip granting Location and Notification permissions during initial registration, while enforcing strict restrictions inside the app until they manually grant those permissions. Additionally, expand the Admin setup form to capture Post Code and Country.

## Proposed Changes

### 1. Database Schema Updates
- **Users Table:** Add two new optional fields to support the Admin address expansion:
  - `postCode: v.optional(v.string())`
  - `country: v.optional(v.string())`
- **API `updateAdminProfile`:** Make these two new fields strictly mandatory for Admins during their setup API call.

### 2. Location Consent Screen Update
- Modify `LocationConsentScreen.tsx` so that users are **not blocked** if they deny OS permissions. 
- They can still proceed through the registration into the app, but they won't have active permissions.

### 3. Dashboard Persistence & Restrictions
If OS permissions (Location & Notifications) are missing when the user loads the dashboard:
- **Top Banner:** A persistent red warning message will appear at the top of the screen: *"You must approve location and notification permissions in settings."*
- **Glowing Settings Gear:** The Settings gear (chark) icon will glow red to draw the user's attention.
- **Guest Restrictions:** 
  - The "Panic Button" will be disabled.
  - The "Upload Map" feature will be disabled.
- **Admin Restrictions:** 
  - The "Register Building" button will be disabled.
  - The "Add Location" features will be disabled.
- **Settings Modal Update:** Inside the settings modal, we will add clear tickboxes/buttons to manually request OS permissions.

### 4. Admin Setup Form Modifications
- In `AdminDashboard.tsx`, the setup layout will be updated:
  - Business Address
  - **[NEW]** Registered Post or Zip Code
  - **[NEW]** Country
- Above the Subscription confirmation box, we will add an optional list showing the required permissions, allowing them to grant them right there in the form if they haven't already.

## Verification Plan
1. Launch the app and explicitly deny permissions during sign up.
2. Verify that I can still log in to the dashboard.
3. Verify the glowing gear, the warning message, and that restricted actions are disabled.
4. Go to settings and grant permissions.
5. Verify the warnings disappear and the restricted buttons become clickable again.

## User Review Required
Please review this implementation plan. Does the flow for the glowing gear, disabled buttons, and the new address fields look correct? Let me know and I will begin the execution!
