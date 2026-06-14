# Phase 15: Enhanced Roll Call & Accountability

We do have a basic `LiveRollCall` component that captures people who open the app and walk outside or press the Panic button. However, it currently lacks two major features to make it a true, life-saving accountability system:
1. It does not clearly separate the list visually into "Inside" vs "Outside".
2. It only tracks people *after* they open the app during an emergency. We don't currently know who was inside *before* the emergency started.

This phase will solve both of those issues, giving the Admin a perfect list of exactly who is still trapped inside versus who has made it out safely.

## User Review Required

> [!IMPORTANT]
> Please review this plan to ensure the logic for how guests "check in" to a building makes sense for your intended user experience.

## Open Questions

- When a user leaves the building on a normal day, do we want to automatically "check them out" (remove them from the building list) using background GPS geofencing, or is it okay if they remain "checked in" until they scan a different building? (Auto-checkout via geofence is safer but requires background location permissions).

## Proposed Changes

---

### 1. Database Updates: Guest Check-in System

We need to track which building a user is currently inside so we can auto-populate the roll call list the exact second an alarm goes off.

#### [MODIFY] `convex/schema.ts`
- Add `activeBuildingId: v.optional(v.id("buildings"))` to the `users` table.

#### [MODIFY] `convex/portal.ts`
- Add a new mutation `checkInToBuilding`.

#### [MODIFY] `components/GuestDashboard.tsx`
- When a user successfully scans a building plan or is auto-connected via geofence, trigger `checkInToBuilding` to register them as an active occupant.

---

### 2. Auto-Populating the Roll Call

When an Admin clicks "Evacuate", the backend must immediately gather all checked-in users and mark them as trapped/unaccounted for.

#### [MODIFY] `convex/portal.ts`
- Update `triggerIncident` and `triggerSiteIncident` mutations:
  - Query the `users` table for anyone where `activeBuildingId === incident.buildingId`.
  - Automatically insert a `rollCall` record for each of these users with status `IN_BUILDING`.
  - This guarantees the Admin has a complete list of occupants *instantly*, even if the guests haven't pulled their phones out of their pockets yet.

---

### 3. Enhanced UI: Sorting "Inside" vs "Outside"

We will rebuild the Roll Call interface on the Admin Dashboard to visually separate the statuses so emergency responders can see exactly who needs help at a glance.

#### [MODIFY] `components/LiveRollCall.tsx`
- Split the raw list into three distinct visual tabs or sections:
  1. **🚨 IN DISTRESS** (Users who pressed Panic) - Flashing Red
  2. **🏢 INSIDE BUILDING** (Unaccounted / At Risk) - Amber
  3. **✅ SAFE / OUTSIDE** (Accounted For) - Green
- Add real-time mathematical counters at the top (e.g., `Total Occupants: 150 | Safe: 142 | Missing: 8`).

## Verification Plan

### Local Testing Plan
- Log in as a Guest and scan a building plan.
- Verify in the Convex Database that the Guest's `activeBuildingId` is correctly set.
- Log in as Admin and trigger a Test Drill for that building.
- Verify that the Guest immediately appears in the "🏢 INSIDE BUILDING" section of the Live Roll Call, even before the Guest opens their app.
- On the Guest phone, press the "I am Safe" or "Panic" button.
- Verify the Guest immediately jumps to the respective "✅ SAFE" or "🚨 IN DISTRESS" list on the Admin Dashboard.
