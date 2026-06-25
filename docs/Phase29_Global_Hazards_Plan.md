# Phase 29: Global Dynamic Hazards & Real-time Sharing

This plan details the implementation of a globally synchronized "Hazards" system. When a user reports a blockage (e.g., fire, collapsed ceiling) on the safe path, that hazard will instantly propagate to the backend database. This forces all other evacuating users' apps to recalculate their routes to avoid the hazard, and instantly alerts the Admin so they can inform the fire brigade.

## User Review Required
> [!IMPORTANT]
> Because Hazards are tied to a specific evacuation event, they will be saved directly into the active `Incident` document in the database. When the evacuation/drill ends, the hazards will be archived alongside the incident record.

## Open Questions
1. Should an Admin have the ability to click on a red "Hazard" block on their live dashboard to manually delete it (e.g., if a user accidentally reported a blockage)? 
2. Do we want to trigger a push notification / in-app audio alert to all users saying "A hazard has been reported. Your route has been recalculated"?

---

## Proposed Changes

### 1. Database Schema Update
Hazards need to be shared globally across the active incident. We will add a `hazards` array to the `incidents` table.

#### [MODIFY] `convex/schema.ts`
- Add `hazards` to the `incidents` table definition:
```typescript
hazards: v.optional(v.array(
  v.object({
    row: v.number(),
    col: v.number(),
    lat: v.number(),
    lon: v.number(),
    reportedBy: v.optional(v.string()), // clerkId of the user
    reportedAt: v.number()
  })
))
```

### 2. Backend Mutations
We need backend functions to allow users to report hazards and admins to manage them.

#### [MODIFY] `convex/portal.ts` (or equivalent mutations file)
- Create `reportIncidentHazard` mutation: Appends a new hazard to the active incident.
- Create `removeIncidentHazard` mutation: Allows an admin to remove a false positive.

---

### 3. Evacuation App (User Side)
When evacuating, users need to see the globally reported hazards and automatically route around them.

#### [MODIFY] `components/EvacuationMode.tsx`
- **Data Fetching:** Fetch the active incident document to retrieve the global `hazards` array.
- **Reporting:** Update the "Report Hazard" button to trigger the `reportIncidentHazard` Convex mutation instead of just updating local state.
- **Routing:** Pass the global `hazards` array into the `aStarGridPath` algorithm. If another user reports a fire, your app will instantly recalculate a detour.
- **Rendering:** Update the `<Canvas>` map renderer to draw all active global `hazards` as highly visible **Red Blocks with Warning Icons**, so the user can clearly see where the danger is on the floor plan.

---

### 4. Admin Live Dashboard (Admin Side)
The Admin needs to see these hazards in real-time to relay the information to the fire brigade.

#### [MODIFY] `components/AdminDashboard.tsx`
- **Data Fetching:** During an active incident, fetch the `hazards` array from the active incident.
- **Rendering:** Update the Live Roll Call map `<Canvas>` to render the same **Red Hazard Blocks**.
- **Admin Control (Optional):** If the Admin taps a Hazard, allow them to clear it (resolving Open Question #1).

---

## Verification Plan

### Automated/Mathematical Verification
- Ensure the `reportIncidentHazard` mutation correctly validates coordinate boundaries before inserting into the array.

### Manual Verification
- **Multi-Device Test:** Open the Evacuation Mode on two different devices/browsers.
- Report a hazard on Device A.
- Verify that Device B instantly updates its map, draws a red block where the hazard is, and recalculates its blue "Safe Path" to avoid the block.
- Verify that the Admin Dashboard instantly shows the red block on the live map.
