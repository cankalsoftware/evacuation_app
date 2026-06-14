# Phase 16: Dynamic Evacuation Routing

The evacuation logic has been fundamentally rewritten to handle dynamic, multi-waypoint navigation based on real-time physics and GPS tracking. 

## The Progressive Nearest-Neighbor Algorithm
The app no longer blindly directs the user to the single nearest point. Instead, it mathematically evaluates the user's location relative to the exit at every single footstep:

1. **Find Destination:** The app identifies the absolute nearest exit to the user (`TargetExit`).
2. **Prevent Backtracking:** It filters out any Turn Points that are physically further away from the exit than the user currently is. This mathematically guarantees the arrow will never point backwards or create infinite loops.
3. **Lock On Target:** From the remaining "forward-progress" Turn Points, the app locks onto the one physically closest to the user.
4. **Compass Direction:** It calculates the GPS bearing to the target and compares it against the phone's live magnetic compass heading (`Location.watchHeadingAsync`) to smoothly rotate the on-screen arrow.
5. **The 5-Meter Handover:** Once the user walks within 5 meters of the targeted Turn Point (`distToTarget <= 5`), the point is instantly marked as visited, and the algorithm re-evaluates to find the next Turn Point or points directly to the Exit!

> [!TIP]
> The app dynamically updates at every GPS tick. If the user accidentally walks off the path or closer to a *different* exit, the algorithm will seamlessly recalculate the nearest `TargetExit` and adjust the Turn Point breadcrumb trail on the fly!
