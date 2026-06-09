# Phase 8: Asynchronous Building Configuration

Currently, Admins are strictly forced to configure the entire building profile (Polygon footprints, GPS coordinates, Master Plan Image) all at once during the "New Building" creation flow. 

To improve the UX and give Admins more flexibility, we will decouple these steps so a Building can be created with just a Name, and the complex configuration can be finished later.

## Proposed Changes

### 1. Database Schema
#### [MODIFY] `convex/schema.ts`
- Make `latitude` and `longitude` fields `v.optional(v.number())`.
- (The `polygon` and `masterPlanId` are already optional in the schema).

### 2. Backend Mutations
#### [MODIFY] `convex/portal.ts`
- **`saveBuilding`:** Update arguments to make `latitude`, `longitude`, `polygon`, and `masterPlanId` optional.
- If the frontend does not send coordinates, default to saving an empty shell.

### 3. Admin UI Experience
#### [MODIFY] `components/AdminDashboard.tsx`
- **New Building Flow:** 
  - Change the validation so that ONLY the Building Name is strictly required to enable the Save button.
  - If a Master Plan Image or Polygon is partially provided, they are uploaded/saved. If not, they are skipped.
  - **Fix Blank Image Preview:** On Web simulators, local blob URIs sometimes fail to render in standard `<Image>` components, making the button look "blank". We will add a robust fallback UI (e.g. "✅ Image Selected") so the Admin has clear confirmation that the file was attached successfully.
- **Managed Buildings List:** 
  - Add visual status badges next to each building in the list.
  - 🟢 **Active:** The building has a polygon and a Master Plan image.
  - 🔴 **Incomplete:** The building is missing its map or GPS polygon, warning the Admin that it cannot be used by Guests yet.

## User Review Required

> [!WARNING]
> Because `latitude` and `longitude` will now be optional, buildings created without them will effectively have `(0, 0)` or `undefined` GPS locations until the admin configures them later.
> Is this plan aligned with your expectations for allowing admins to finish setting up the building later?
