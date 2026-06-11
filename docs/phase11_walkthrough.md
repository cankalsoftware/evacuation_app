# Phase 11 Walkthrough: Unified Map Editor

## Summary of Changes

We completely revamped the Admin's map management experience. Previously, "Calibrate Map Image" and "Edit Safe Routes" were two separate buttons launching two entirely disconnected modals. 

This led to friction and allowed scenarios where routes could be drawn without a fully calibrated map, leading to math errors in the coordinate mapping.

We have merged them into a **single, 2-Step Map Editor workflow**.

### 1. Unified Modal & Tabs
- The two buttons in the admin dashboard have been replaced with a large `🗺️ Open Map Editor` button.
- The modal opens with a tabbed interface at the top: **Step 1: Calibrate** and **Step 2: Safe Routes**.
- **Enforced Linearity**: The "Step 2: Safe Routes" tab is completely disabled and cannot be clicked until all 4 calibration points have been successfully placed and saved.
- When you click "Save" on Step 1, it automatically transitions you to Step 2.

### 2. Enhanced Safe Routes Editor
- **Calibration Context**: When drawing Safe Routes in Step 2, the four Calibration corner points are now overlaid onto the image at 30% opacity. This provides the admin with an intuitive visual boundary of the "playable area" while drawing routes.
- **Node Type Toolbar**: Added a floating toolbar allowing the admin to explicitly toggle between placing a `🔵 Turn Point` and a `🚪 Exit`.
- **Multiple Exits**: The routing node placement logic was upgraded to handle an unlimited number of Exit nodes (rendered distinctly as green pins with an 'E'). 
- **Undo Capability**: Added an `Undo` button to easily pop the last placed node off the stack without having to "Clear All" and start over.

- [x] Calibration context pins successfully render in the background of Step 2.

### 3. Dynamic Proximity Routing (Guest Navigation)
- **Stateless Hill-Climbing Algorithm:** The Guest Evacuation logic (`EvacuationMode.tsx`) was completely rewritten to use a real-time proximity routing algorithm rather than static predefined paths.
- **Continuous Evaluation:** On every step the guest takes (via the Pedometer):
  1. The app scans all available **Exits** and targets the absolute nearest one geometrically.
  2. The app scans all unvisited **Turn Points** and targets the nearest one.
  3. If the nearest Turn Point is closer than the nearest Exit, the guest is routed to the Turn Point. Once reached, it is marked as "visited" and drops out of the navigation mesh, automatically pulling the guest toward the next logical node closer to the exit.
  4. If the nearest Exit is closer than any Turn Point, the guest is routed directly to the door.
- **Sequence Independence:** Because this logic recalculates dynamically 100 times a second, Admins no longer need to worry about the specific array order in which they draw Turn Points. The routing inherently adapts to the guest's unique spatial location.
- **Admin Workflow Integration:** The Map Editor was updated to enforce placing an Exit first, and provides strategic UI hints advising admins to drop Turn Points at critical corners and every 4-5 meters in long corridors to build a dense navigation mesh.

## Verification

- [x] "Open Map Editor" successfully opens the unified interface.
- [x] Step 2 tab is no longer strictly locked, but "Save All" validation guarantees all data is complete.
- [x] Toggling between Turn Points and Exits works perfectly, injecting `isExit: true/false` into the payload.
- [x] Repositioning flow is intuitive and auto-clears active state.
- [x] Guest navigation dynamically routes to nearest exit using intermediate turn points.
