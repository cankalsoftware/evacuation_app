# Phase 19: Fire Brigade & Warden Readiness (Real-World Logistics)

Based on real-world fire safety procedures and 20 years of Fire Marshall experience, this phase focuses on the physical realities of evacuations.

## Proposed Features

### 1. Multi-Floor Setup & Floor Sweeping (Warden System)
**The Problem:** GPS lacks accurate altitude/depth tracking. If a phone is left on a desk, the app shows the user "In Building", potentially sending firefighters into danger for a ghost signal.
**The Solution:** 
- **Setup:** Buildings can now have multiple floors. Admins can assign the same floor plan to multiple floors or upload different plans for specific floors.
- **Warden Sweep:** The "Live Users" list (formerly Live Roll Call) will include a list of all floors. As Fire Marshalls physically walk and check floors, they can tick them off as "Safe/Cleared". 
- **Redundancy:** If all floors are marked "Cleared" by Marshalls but GPS still shows a user inside, the system can safely treat that signal as a redundant/abandoned device.

### 2. PEEPs (Personal Emergency Evacuation Plans) & Dedicated Routes
**The Problem:** Wheelchair users, pregnant personnel, or those on crutches cannot use stairs during a fire. Directing them to a standard exit is highly dangerous.
**The Solution:** 
- **User Registration:** Users can register their PEEP needs (e.g., Pregnant, Wheelchair, Crutches, Impairment, Other).
- **Live Prioritization:** During an incident, PEEPs users are pinned at the very top of the Live Users list with a special alert.
- **Dedicated Setup:** The Admin Building Setup will feature a split menu: "Normal Routes" and "PEEPs Routes". Admins can draw specific routes to designated Fire Refuge Locations for PEEPs users.
- **Guest Flow:** During an evacuation, PEEPs users are automatically routed to their designated Refuge Location instead of a standard exit.

### 3. Critical Battery Telemetry & Auto-SOS
**The Problem:** A trapped user's phone dies, and the Fire Brigade loses their live location without warning.
**The Solution:** 
- **Priority Listing:** Users with `<10%` battery are placed second in priority on the Live Users list (just below PEEPs).
- **Auto-SOS:** If signal is lost from a critical-battery device, the app automatically triggers an SOS to the Admin using their last known coordinates.
- **Manual Override:** Since the user might have escaped safely just as their phone died, the Admin will have a new "Mark Safe" button next to their name in the Live Users list to manually clear the SOS once they are physically accounted for outside.

### 4. Dynamic Hazard/Blocked Path Marking
**The Problem:** A fire or debris blocks a corridor, but the app's A* pathfinding still routes users into the hazard because it is the "shortest path".
**The Solution:** 
- **Hazard Button:** Both Users and Admins will have a "Blocked/Hazard" button on their evacuation screen.
- **Live Sync:** Pressing this drops a Red Hazard Dot at their current GPS coordinates on the master map. 
- **"One Notices, All Know":** This hazard instantly syncs to all users and admins, providing real-time situational awareness of blocked routes.

### 5. Unexpected Return Auto-SOS
**The Problem:** Users who have safely evacuated sometimes try to re-enter a burning building to retrieve belongings.
**The Solution:** If an active drill/evacuation is ongoing, and a user whose status is currently "SAFE" breaches the building polygon boundary to go back inside, their device will automatically trigger an SOS alert to the Admin.

### 6. "All Clear" / Stand Down Protocol
**The Problem:** Evacuations can be false alarms, but users don't know when to return.
**The Solution:** Resolving an incident will push an explicit "All OK - Safe to Return" message to all users in the app, formally ending the evacuation state.

### 7. Assembly Points (Future Exploration)
- **Concept:** After reaching the "Safe" zone outside the building, divert users to a wider map showing specific Assembly Points to keep the building perimeter clear. This requires wider mapping integration and will be scoped once the primary building flows are solidified.

### 8. Firevision.uk AI CCTV Integration (Automated Secondary Sweep)
**The Problem:** Even highly trained Fire Marshalls are human and can make errors when visually checking and ticking off a floor as "Safe".
**The Solution:** As an extension of the broader **firevision.uk** ecosystem, once a Fire Marshall manually clicks the "Clear" button for a specific floor, it will automatically trigger the Firevision AI system via API. The AI will instantly review all live CCTV camera feeds on that floor for human detection. This provides a guaranteed, automated second opinion to catch any stragglers before the zone is fully signed off, completely eliminating human error.
