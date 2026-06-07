# Phase 6: Indoor Mapping & Evacuation Guidance (Version 2)

You bring up a critical point: **In a panic, looking at a 2D map can be confusing and disorienting.** 
People need clear, immediate, and fool-proof instructions. 

Here is a breakdown of how we can achieve Option C (Active Calculation) while addressing the problem of indoor tracking and panic-induced disorientation.

## 1. Can we use GPS for Turn-by-Turn "Blue Dot" Navigation?

> [!WARNING]
> **Unfortunately, No.** Standard GPS does not work reliably indoors. It cannot tell which way you are facing in a hallway, nor can it pinpoint you to a specific meter. A bouncing, inaccurate GPS dot would cause *more* panic.

### Alternative Technologies for Indoor "Blue Dot":
If we absolutely want real-time turn-by-turn tracking, we must rely on other hardware. This is usually reserved for enterprise installations:
- **Bluetooth Beacons (iBeacons):** The hotel installs small Bluetooth emitters in every hallway. The phone reads signal strength to pinpoint location.
- **Wi-Fi Fingerprinting:** Mapping the signal strength of all Wi-Fi routers in the building.
- **AR Visual Odometry:** Using the phone's camera to track movement (like Apple ARKit).

**Verdict:** For our app, requiring hotels to install Bluetooth beacons is a massive barrier to entry. We must design a system that works *without* real-time location tracking after they leave the room.

## 2. How to Implement Option C (Active Calculation) without External Servers

We do **not** need an external server. Your current Convex backend is a powerful Node.js environment capable of running routing algorithms instantly.

### The Graph Model (How the backend thinks)
1. **Nodes & Edges:** The Admin maps the building as a "Graph". 
   - Node 1: Room 204
   - Node 2: East Corridor
   - Node 3: West Corridor
   - Node 4: Main Stairs
2. **The Calculation:** We use a standard pathfinding algorithm (like **Dijkstra's Algorithm** or **A***). Convex runs this calculation in milliseconds.
3. **The Emergency:** If a fire breaks out in the "East Corridor" (Node 2), the Convex server flags Node 2 as `blocked: true`. The algorithm instantly recalculates the shortest safe route using the West Corridor.

## 3. Solving the "Panic" Problem (UX Design)

Since we cannot rely on a live-updating GPS dot to walk them down the hall, we must provide instructions so clear that they don't need to look down at their phone constantly.

### Strategy A: Turn-by-Turn Text & Voice 
Instead of just showing a map, the app generates a "Flight Plan" of instructions based on the calculated route:
1. *Voice/Text:* "Exit your room. Turn Left."
2. *Voice/Text:* "Walk 20 meters to the end of the hall."
3. *Voice/Text:* "Enter the West Stairwell and go down 2 flights."
**Benefit:** Uses React Native's Text-to-Speech engine. Very accessible and keeps eyes up.

### Strategy B: Compass-Oriented Map (Heads Up Navigation)
Even if we don't know exactly *where* they are in the hall, we know what *direction* they are facing.
- We use the phone's built-in Compass (Magnetometer).
- When they exit Room 204, the map on their screen automatically rotates so "Forward" on the screen matches the physical hallway in front of them. 
- A massive, glowing arrow points left or right based on their orientation.

### Strategy C: The "Step-by-Step" Swipe UI
Similar to a recipe app. 
- **Screen 1:** [Large Arrow Pointing Left] "Turn Left out of your room." (User swipes right when done)
- **Screen 2:** [Straight Arrow] "Go to the end of the hall."
- **Screen 3:** [Stairs Icon] "Go down to the Lobby."

## Conclusion & Proposed Path Forward

To implement Option C effectively, I recommend:
1. Building an Admin interface to create the Node Graph (connecting rooms to hallways to stairs).
2. Writing the pathfinding algorithm directly in Convex.
3. Designing the Guest UI to rely on **Compass Orientation + Step-by-Step Voice/Text Commands**, rather than a live-moving GPS dot.

**Do you agree with using Compass + Step-by-Step Voice commands to overcome the lack of indoor GPS?**
