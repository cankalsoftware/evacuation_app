# Phase 16: Dynamic Routing Algorithm Update

This plan outlines the changes to the `EvacuationMode` routing algorithm to fulfill the requirement of dynamic step-by-step waypoint routing towards the nearest exit.

## Algorithm Logic (Option B - Dynamic Routing)

Based on the feedback, the turn points act as a scatterplot of safe "breadcrumbs" along the safe routes of the building. To ensure the user always progresses towards the exit without doubling back or getting stuck, we will implement a **Progressive Nearest-Neighbor Algorithm**.

### The Mathematical Rules:
At every GPS ping during the evacuation, the system will recalculate the target using the following steps:
1. **Identify Destination:** Find the absolute nearest Exit (`TargetExit`) to the user's current physical location.
2. **Filter Valid Turn Points:** Look at all unvisited Turn Points. Discard any turn points that are further away from the `TargetExit` than the user currently is. (This prevents the app from routing the user backwards).
3. **Find Next Step:** Among the remaining valid Turn Points (which are guaranteed to be moving the user closer to the exit), find the one that is closest to the user's current location.
4. **Direct (Using Phone Compass):** 
   - We will use the already-implemented **Phone Magnetometer/Compass (`Location.watchHeadingAsync`)** to continuously calculate the user's physical facing direction.
   - The app will calculate the exact bearing to the target node and dynamically rotate the on-screen arrow using the compass heading so it points accurately in the physical world.
5. **Mark Visited (5-Meter Rule):** 
   - When the user comes within **5 meters or less** of the targeted Turn Point (i.e. distance `<= 5` meters), it is marked as visited and the algorithm immediately targets the next point in the chain. 

## Proposed Changes

### `components/EvacuationMode.tsx`
- Rewrite `evaluateRouting` to implement the Progressive Nearest-Neighbor Algorithm.
- Continue using `visitedNodeIdsRef` to track which points the user has already passed.
- Update the distance threshold to `x <= 5` meters (5 meters or less) to match the admin setup guidelines.
- Ensure the existing Phone Compass logic seamlessly updates the directional arrow for every new targeted waypoint.

## Verification Plan

### Manual Verification
- Start a test drill in a building with Turn Points.
- Verify the compass-driven arrow points accurately to the first Turn Point.
- Walk within **5 meters or less** of the Turn Point to trigger the "reached" state.
- Verify the arrow immediately snaps to point to the next Turn Point, or the Exit if no more turn points are in the path.
