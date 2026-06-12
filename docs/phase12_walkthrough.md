# Walkthrough: Phase 12 (Real-Time Incident Engine MVP)

I have fully implemented the Phase 12 Reactive Evacuation Engine with the Site Grouping hierarchy.

## What was changed

### 1. Database & Schema
- Updated the `buildings` table to support an optional `siteName` property.
- Added a new `incidents` table to track real-time active alarms across the system.

### 2. Admin Capabilities (`AdminDashboard.tsx`)
- **Site Registration**: The "Add Location" modal now features a `Site Name (Optional)` input below the building name.
- **Site Grouping UI**: The dashboard dynamically sorts your managed buildings into categorized sections based on their `siteName`. Buildings without a site fall under "Independent Buildings".
- **Mass Trigger**: Each completed Site Header now displays an **"🚨 Evacuate Site"** button. Clicking this triggers the alarm for *every single building* within that site simultaneously.
- **Granular Trigger**: Inside each building card, there is an **"🚨 Evacuate Building"** button to trigger a localized alarm.
- **Visual Feedback**: When an alarm is active, the building card glows with a red warning border and the buttons flip to **"✅ Resolve Evacuation"**.

### 3. Guest Real-Time Alarms (`GuestDashboard.tsx`)
- Integrated a live Convex query (`getActiveIncident`) that constantly listens to the safety status of the building the guest is currently geo-located inside.
- **Auto-Hijack**: If an admin hits "Evacuate" for their building or site, the Guest app uses a React `useEffect` to immediately force the state to `isEvacuating = true`. This blasts the audio alarm and flashes the screen red without the guest ever needing to press the Panic button!
- If the admin resolves the alarm, the guest gets a success toast notifying them of the "All Clear".

## How to Test

1. Add a new building (or edit an existing one) and give it a Site Name (e.g. "North Campus").
2. Complete the building setup (Polygon, Master Plan, Calibration, Safe Nodes).
3. Ensure your test device (or web simulator) is spoofing a location inside that building's polygon.
4. On the Admin Dashboard, click **"🚨 Evacuate Site"**.
5. Switch to the Guest view. The Evacuation Mode should have launched automatically!
