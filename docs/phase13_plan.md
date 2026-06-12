# Phase 13: Test Drills, Live Roll Call & Emergency SOS Tracking

This phase implements scheduled automated drills, native push notifications, a Live Roll Call system, and critical SOS features to protect trapped or injured users.

## Firefighter Review & Open Questions
As an AI looking at this from a fire safety and life-safety perspective, you have mapped out a brilliant and robust system. Here are three additional features highly recommended in real-world fire safety protocols that I have integrated into this plan:
1. **The "I am Safe" Button**: GPS can drift or fail near concrete. While we will auto-mark them safe if they leave the boundary, we should also give users a manual "I am Safe / At Assembly Point" button to confirm their safety.
2. **Post-Drill Analytics**: After a drill, the system should tell the admin "Evacuation took X minutes." This is the core metric Fire Brigades use to pass/fail a building drill.
3. **Pre-Evac Instructions**: A quick 3-bullet list on the evacuation screen reminding them: "Leave belongings, do not use elevators, follow exit signs."

> [!WARNING]
> **Overriding 'Do Not Disturb' (Silent Mode)**
> Yes, it is technically possible, but it requires special permissions:
> - **Android**: We can create a "High-Priority Notification Channel" that overrides DND, and we can play loud sounds via the app audio engine if the app is open.
> - **Apple (iOS)**: Apple strictly locks this down. To override the physical silent switch or DND on an iPhone for a push notification, the app requires a **"Critical Alerts Entitlement"**. We will build the code for it, but to publish the app to the App Store, you will have to submit a written request to Apple explaining you are an emergency/safety app to be granted this entitlement.

---

## Proposed Changes

### 1. Database Schema Updates (`convex/schema.ts`)
We will add fields to support SOS modes and time tracking.

#### [MODIFY] `convex/schema.ts`
- **buildings / sites**: Add `nextDrillAt: v.optional(v.number())`, `drillJobId: v.optional(v.id("_scheduled_functions"))`
- **incidents**: Add `isDrill: v.boolean()`, `endTime: v.optional(v.number())` (for calculating evacuation speed).
- **users**: Add `expoPushToken: v.optional(v.string())`
- **[NEW] rollCall**: `defineTable({ incidentId: v.id("incidents"), userId: v.id("users"), status: v.string(), /* IN_BUILDING, SAFE, PANIC */ lastLat: v.number(), lastLon: v.number(), updatedAt: v.number() })`

---

### 2. Live Roll Call & SOS Panic Logic (`convex/portal.ts`)
During an active incident, the system tracks who is inside, who has escaped, and who is in distress.

#### [MODIFY] `convex/portal.ts`
- **`updateEvacuationStatus`**:
  - Automatically updates to `IN_BUILDING` (Red Cross) or `SAFE` (Green Tick) based on GPS.
  - Accepts a manual override payload: `setPanic: true` or `setSafe: true`.
- **`getRollCall`**:
  - Sorts users rigidly: **PANIC (Flashing Red Bracket)** -> **IN_BUILDING (Red Cross)** -> **SAFE (Green Tick)**.

---

### 3. Automated Drills & Critical Push Notifications
We will request the highest level of notification urgency available on the OS.

#### [MODIFY] `App.tsx` & `GuestDashboard.tsx`
- **Mandatory Permissions**: Force the user to accept Push Notification permissions. We will specifically request `allowCriticalAlerts: true` (which triggers the special iOS/Android emergency override dialogs).
- **`convex/portal.ts`**: Send push notifications with the `sound: "critical"` flag to bypass silent switches where permitted by the OS.

---

### 4. Admin Dashboard & Emergency Map Sharing (`components/AdminDashboard.tsx`)
Admins need tactical awareness and the ability to find panicked users instantly.

#### [MODIFY] `components/AdminDashboard.tsx`
- **Live Roll Call View**:
  - 🆘 `[ ❌ User Name ]` **(Flashing Red)**: Users who pressed the Panic Button.
  - ❌ `User Name`: Users still inside.
  - ✅ `User Name`: Safe users.
  - **Coordinates & Locate**: Display the exact `lat/lon` under Red Cross/Panic users, alongside a "Locate" button to drop a pin on the Master Map.
- **SOS Alerts**: If a user hits the Panic button, trigger an aggressive audio alarm on the Admin's device and flash the screen red.
- **Share Map**: Add a "Send to Fire Brigade" button to screenshot the tactical map and share it to emergency contacts.
- **Post-Drill Analytics**: Upon clicking "Resolve", calculate and display the total evacuation time.

---

### 5. Guest Experience (`components/EvacuationMode.tsx`)
Give users the tools they need to navigate or call for help.

#### [MODIFY] `components/EvacuationMode.tsx`
- **Is Drill Check**: If `incident.isDrill === true`, change styling to Amber/Orange and display "🚨 TEST DRILL 🚨".
- **Safety Instructions**: Display quick reminders ("Do not use elevators").
- **PANIC Button**: A massive red SOS button. Pressing it:
  1. Maximizes phone volume and plays a loud siren from the device speaker (to attract physical help).
  2. Sends the `PANIC` status to the Admin Dashboard.
- **"I am Safe" Button**: A manual button allowing users to override a drifting GPS and declare they have reached the assembly point.

## Verification Plan
1. Admin schedules a drill. Guest is forced to accept Critical Alert Push Notifications.
2. Server triggers the drill. Guest's phone bypasses DND to ring loudly (if OS permissions granted).
3. Guest enters Evacuation Mode (Amber styling) and clicks the **PANIC** button.
4. Guest's phone emits a loud siren. Admin's screen flashes red, sounds an alarm, and pins the Guest to the top of the roster with flashing brackets `[ ❌ Name ]` and their coordinates.
5. Admin clicks "Locate" to find them on the map, then simulates sharing it with the Fire Brigade.
6. Guest clicks "I am Safe". Their status moves to the bottom as a Green Tick.
7. Admin resolves the drill and views the final evacuation time.
