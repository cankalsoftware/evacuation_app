# Phase 13: Emergency Roll Call & Drill System Implementation

The complete set of Drill and Live Roll Call tracking features has been implemented!

## 1. Live Roll Call & Emergency Tracking
- **Auto-Pinging**: When `EvacuationMode` starts, the guest's device continuously pings their GPS location and status (`IN_BUILDING`, `SAFE`, or `PANIC`) to Convex every 5 seconds.
- **Admin Dashboard Tracking**: Administrators have a new **"Live Roll Call"** widget that appears during active evacuations. It lists all users with their live coordinates and current status.
- **Panic Prioritization**: Users in `PANIC` state (SOS) are highlighted in pulsing red and sorted to the top of the Admin's Roll Call list.
- **Safe State**: Users who mark themselves as safe drop to the bottom with a green `✅`.

## 2. Locate & Share with Fire Brigade
- Next to each trapped user in the Roll Call list, there is a **"Locate"** button.
- Clicking this opens the map view with a massive pulsing `🆘` pinpointing their exact live coordinates.
- On this map screen, an **"🚨 SHARE TO FIRE BRIGADE"** button allows the Admin to invoke the native OS sharing menu (SMS, Email, WhatsApp) to send the exact user coordinates, user name, and building details immediately to emergency services.

## 3. Guest SOS & Safe Controls
- The Evacuation Screen now features an overlay with two large buttons: **SOS** and **I AM SAFE**.
- Pressing SOS overrides the device audio to play a looping, max-volume siren (even overriding silent mode restrictions on the OS level where permitted), immediately pings the server with a `PANIC` status, and turns the screen deep red.
- Pressing **I AM SAFE** stops the siren, sets the user's status to green, and switches to a success screen telling them to await further instruction.

## 4. Test Drills & History Metrics
- Admins can now trigger **Test Drills** across individual buildings or entire sites directly from the dashboard.
- During a drill, the UI changes from severe Red to Amber to clearly indicate it is a drill, both on the Admin screen and the Guest screen, avoiding unnecessary panic while still testing the system functionality.
- **Incident History**: Once an evacuation or drill is resolved, the system calculates the total elapsed duration of the event. A new "Recent History" section on the Admin Dashboard persistently displays these past events, highlighting whether they were Drills or Real Evacuations, the timestamp, and the final evacuation time metric.
- **Export Safety Logs**: For safety reporting and compliance, Administrators can click the "Export Logs" button to generate and download a complete historical record of all incidents across their sites as a `.csv` spreadsheet, which can be printed or shared with authorities.

## 5. Storage Optimization (Cleanup Scripts)
- Convex has been updated to aggressively collect garbage data.
- When an administrator deletes a building, the associated map images are actively deleted from Convex storage using `ctx.storage.delete()`.
- When an admin uploads a new site/building image, the old one is automatically removed.
- When a guest cancels a Draft Evacuation Scan on their dashboard, the temporarily uploaded image is instantly deleted from storage to prevent pile-up.

> [!NOTE]
> All changes are live in your local environment. To verify the auto-pinging and roll call features, you will need to open the app on multiple simulators or devices simultaneously (one as Admin, one as Guest).
