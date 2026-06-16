# Phase 21: Post-Registration Permissions & Address Expansion - Walkthrough

## What Was Accomplihed
1. **Skipping Permissions**: Users and Admins can now press "Skip for now" on the `LocationConsentScreen` or deny OS prompts without being blocked from completing their registration.
2. **Dashboard Gating**: If users enter the app without both Location and Notification permissions:
   - A persistent red warning banner appears at the top of the dashboard.
   - The Settings Gear icon pulses red to draw attention.
   - For Guests: The **Panic** button and **Upload Map** buttons are strictly disabled.
   - For Admins: The **Add Location** and **Register Building** buttons are strictly disabled.
3. **Settings Recovery & Unified Tick Box**: In the `ProfileSettingsScreen` (for Guests) and the Admin Setup Form (for Admins), users are provided with a single checkbox to request/verify Location and Push Notification permissions simultaneously.
4. **Admin Address Expansion**: Added `Registered Post or Zip Code` and `Country` to the Admin onboarding flow. 
5. **Database Enhancements**: 
   - Changed `agreedToSubscription` to `agreedToTandC`.
   - Added `permissionsGranted` to track the unified device permissions status in the user schema.
6. **Mandatory Guest T&C**: Guests who skip registration are forced into the `ProfileSettingsScreen` and must tick the `agreedToTandC` box before they can close the modal and use the dashboard.

## Files Updated
- `components/LocationConsentScreen.tsx`
- `components/AdminDashboard.tsx`
- `components/GuestDashboard.tsx`
- `components/ProfileSettingsScreen.tsx`
- `convex/schema.ts`
- `convex/users.ts`
- `convex/portal.ts`

## Verification
You can now freely register a brand new Admin or Guest, click "Skip for now" on the Permissions page, and witness the restricted dashboard state. Entering settings and granting permissions dynamically re-activates the restricted buttons in real-time.
