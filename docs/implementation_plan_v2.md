# Neutralize Database Schema and Extract Plan Data

We are neutralizing the database schema by cleaning out unused collections and organizing the evacuation plan data into its own dedicated table. Furthermore, all relational links between tables will use `clerkId` (the Clerk authentication string) instead of internal Convex `_id`s, simplifying role-based access control and security checks.

## Proposed Changes

### `convex/schema.ts`
- **[MODIFY]** Remove the `scannedPlanId`, `scannedPlanLat`, `scannedPlanLon`, and `scannedAt` fields from the `users` table.
- **[MODIFY]** Remove the `rooms`, `buildings`, and `incidents` tables completely.
- **[MODIFY]** Update `locationConsent` to link via `clerkId: v.string()` instead of `userId: v.id("users")`.
- **[NEW]** Add a new `plans` table containing:
  - `clerkId` (string)
  - `storageId` (storage ID)
  - `latitude` (number)
  - `longitude` (number)
  - `scannedAt` (number)
- **[NEW]** Add a `.index("by_clerkId", ["clerkId"])` on the `plans` table to quickly fetch the 1:1 map for the user.

### `convex/portal.ts`
- **[MODIFY]** Update `getDashboardData` to query the `plans` table for the user's `clerkId`. Maintain the same payload structure for the front-end.
- **[MODIFY]** Update `uploadScannedPlan` to check if a plan already exists for the `clerkId`. Upsert the data (insert if new, replace/patch if exists).
- **[MODIFY]** Strip out the `buildings` and `incidents` logic from the `admin` response payload.
- **[DELETE]** Remove the `triggerIncident` mutation entirely.

### `convex/consent.ts`
- **[MODIFY]** Update consent queries and mutations to reference `clerkId` directly instead of querying for the user `_id` first.

### `components/AdminDashboard.tsx`
- **[MODIFY]** Strip out the UI code that renders the "Active Incidents" and "Managed Buildings" lists. Replace it with a simplified placeholder UI until new admin features are built.

## Verification Plan
1. **Automated Validation:** Ensure Convex compiles successfully with the new schema and no type errors exist.
2. **Manual Verification:** Open the app as a guest, upload a plan, and verify that it creates exactly *one* record in the new `plans` collection, linked via `clerkId`. Verify `AdminDashboard` loads without crashing.
