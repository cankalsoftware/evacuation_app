# Phase 12: Real-Time Incident Engine & Site Hierarchy Plan

This document outlines the final phase of the core application based on the original master plan, updated to include organizational Site Grouping for mass enterprise evacuations.

## Goal
Implement a Reactive Evacuation Navigation Engine with a Site-based grouping hierarchy. When an Admin triggers an evacuation at either the **Building** level or the **Site** level, all guests currently geo-located inside affected buildings should immediately and automatically have their devices launch into Evacuation Mode with high-intensity audio/visual alarms.

## 1. Schema Changes (`convex/schema.ts`)
Add `siteName` to the `buildings` table to allow optional grouping:
```typescript
  buildings: defineTable({
    name: v.string(),
    siteName: v.optional(v.string()), // e.g. "Campus A", "London HQ"
    address: v.string(),
    // ...
```

Add the `incidents` table to act as the global state for active alarms:
```typescript
  incidents: defineTable({
    buildingId: v.id("buildings"),
    isActive: v.boolean(),
    triggeredAt: v.number(),
    resolvedAt: v.optional(v.number()),
  }).index("by_building", ["buildingId"]),
```

## 2. Convex Portal Updates (`convex/portal.ts`)
Implement endpoints for the incident lifecycle:
- `triggerIncident`: Admin mutation to activate an alarm for a specific `buildingId`.
- `triggerSiteIncident`: Admin mutation to activate alarms for ALL buildings sharing a specific `siteName`.
- `resolveIncident`: Admin mutation to end the alarm for a specific `buildingId`.
- `resolveSiteIncident`: Admin mutation to end alarms for ALL buildings in a `siteName`.
- `getActiveIncident`: Guest query that returns the currently active incident for their building (used for real-time WebSocket listening).

## 3. Admin Dashboard Updates (`components/AdminDashboard.tsx`)
**Registration ("Add Location") Modal:**
- Provide a "Site Name (Optional)" text input field. Provide autocomplete suggestions based on the admin's existing buildings.

**Dashboard Hierarchy:**
- Parse `dashboardData.buildings` and group them by `siteName`.
- Create a UI Header for each Site, featuring a **"🚨 Evacuate Site"** button.
- List buildings under their respective Site headers. Buildings without a `siteName` fall under an "Independent Buildings" header.
- Add an individual **"🚨 Evacuate Building"** button to each building card.
- If a building/site is actively alarmed, swap the button to "Resolve Evacuation" and highlight the UI card in red.

## 4. Guest Dashboard Updates (`components/GuestDashboard.tsx`)
- Subscribe to the `getActiveIncident` query for the building the user is currently standing in (`autoBuilding._id`).
- Watch this query with a `useEffect`: if an incident goes active, automatically invoke `setIsEvacuating(true)`.

## 5. Verification Process
1. Use two separate devices or browser windows (one Admin, one Guest).
2. The Admin creates two buildings under the site "North Campus".
3. The Guest is physically (or mocked via Expo location) inside "North Campus - Building A".
4. The Admin clicks "Evacuate Site" for North Campus.
5. Both buildings on the Admin Dashboard should immediately flash red.
6. The Guest device should automatically launch `EvacuationMode` with audio and visual alarms without user interaction.
7. The Admin clicks "Resolve Site", stopping the alarms.
