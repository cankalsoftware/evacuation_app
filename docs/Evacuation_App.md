# FireVision Evacuation App - Core Platform Documentation

## 1. What is FireVision Evacuation App?
FireVision is a modern SaaS platform (mobile and web) designed to digitize and manage emergency building evacuations. It provides real-time, interactive, geo-anchored floor plans and automated emergency routing to guide occupants safely out of a building during a crisis (e.g., fire). It also provides building administrators and fire wardens with a live console to monitor evacuation statuses, track occupants in distress, and manage emergency incident records.

## 2. What We Do
* **Real-Time Evacuation Routing:** Uses advanced A* pathfinding and grid-based mapping to dynamically draw the fastest and safest route to the nearest exit on a floor plan.
* **Dynamic Floor Plan Mapping (Geo-Anchoring):** Allows building admins to upload static images or PDFs of their floor plans and calibrate them directly to real-world GPS coordinates.
* **Instant Incident Management:** Admins can trigger building-wide alarms ("Real Evacuation" or "Test Drill") from the dashboard, instantly pushing critical emergency alerts to all occupants in the building.
* **Panic Alerts & Roll Call:** Guests can trigger a "Panic Button" if trapped, injured, or requiring assistance, instantly alerting the Admin with their precise coordinates.
* **Automated Geofencing:** The app automatically detects when a user physically enters a registered building based on their device's GPS and automatically links them to that building's emergency network.
* **Strict Role-Based Access Control:** Total separation of capabilities between Guests (occupants/employees) and Admins (building managers/wardens).

## 3. What We Don't Do
* **Hardware Alarm Integration:** We do not physically wire into or replace existing legacy fire alarm panels, heat sensors, or smoke detectors. FireVision is a supplementary software management tool triggered manually via the app.
* **Indoor Turn-by-Turn GPS:** Because standard mobile GPS signals cannot reliably penetrate large buildings, we do not provide "blue-dot" live tracking indoors. Instead, we rely on user-declared starting points (Room/Floor) and visual floor plan orientation combined with Grid Routing.
* **Automated Emergency Services Calling:** The app does not automatically dial 999 or 911. Admins must still follow standard emergency protocols and contact emergency services.

## 4. Limits and Restrictions
* **Strict Permission Requirements:** For the app to function, it strictly requires active **Location Tracking (GPS)** and **Push Notifications** to be granted by the user's Operating System. If these are denied, core functionality (Panic Button, Mapping, Building Registration) is disabled and greyed out.
* **Corporate Domain Verification:** To prevent fraudulent or duplicate building registrations, Admins must register with a valid corporate email domain. Public domains (e.g., `@gmail.com`, `@yahoo.com`) are strictly blocked.
* **Calibration Accuracy:** The accuracy of the evacuation routing relies entirely on the Admin's precision when calibrating the floor plan to real-world GPS coordinates, and correctly tracing walls, obstacles, and exit nodes in the Unified Map Editor.

## 5. How to Use (Admin Guide)
1. **Registration & Approval:** Sign up with a corporate email, verify your identity via OTP, and accept the Terms & Conditions.
2. **Setup Profile:** Provide your Business Name, Business Address, Post Code, Country, and Employer count. You must manually tick the consent box to grant Location and Notification permissions.
3. **Register Building:** Click "Register Building", drop a pin on the real-world satellite map, and draw a polygon to define the building's physical boundaries.
4. **Upload Floor Plan:** Upload a clear image of the building's floor plan.
5. **Calibrate & Map:** Map 4 points on the floor plan image to 4 real-world GPS coordinates (Geo-Anchoring). Use the Map Editor to define walls (obstacles) and safe exits.
6. **Trigger Incidents:** Use the Admin Dashboard to trigger an incident. Select either "Real Evacuation" or "Test Drill". Monitor the live dashboard for connections and panic alerts. End the incident once the building is secure.

## 6. How to Use (Guest Guide)
1. **Quick Registration:** Sign up using any email, Google, or Apple login.
2. **Grant Permissions:** Read the setup modal and tick the consent box to allow Location and Push Notifications. Without this, the dashboard remains locked.
3. **Setup Location:** Input your current Room number (e.g., 204) and Floor number (e.g., 2).
4. **Automated Linking:** As long as you are physically standing inside the boundaries of a registered building, the app automatically connects you.
5. **During an Emergency:** If an alarm triggers, you will receive a Critical Push Notification (which overrides silent mode on supported devices). Open the app to view the live map with a highlighted route from your room to the nearest exit.
6. **Panic Mode:** If you are trapped, hold down the Panic button for 3 seconds to broadcast your location to the Admin's dashboard.

## 7. Technical Details & Development Phases Summarized
* **Phases 1-5:** Implemented Core Authentication (Clerk), Database (Convex), Profile Setup, and basic image uploading.
* **Phases 6-11:** Built the Geo-anchoring math, Map Calibration, and the Unified Map Editor (drawing walls and exits on HTML Canvas).
* **Phases 12-15:** Engineered the Real-time Incident Engine, Expo Push Notifications (with Critical Alert overrides), Panic Button mechanism, and Live Admin Roll Call.
* **Phases 16-18:** Integrated advanced Grid Routing (A* Algorithm) converting the canvas into a pathfinding grid, and split database queries for performance optimization.
* **Phases 20-21:** Enforced strict Admin Onboarding, unified Permissions gating, and Corporate Domain Validation to prepare the app for production SaaS deployment.
