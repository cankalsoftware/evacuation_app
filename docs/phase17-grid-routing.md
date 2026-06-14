# Phase 17: Grid-Based Evacuation Mapping

This phase completely replaces the scattered "Turn Point" pins with a professional, video-game-style Navigation Mesh (NavMesh) grid. 

## 1. The Core Concept
Instead of dropping individual pins, the Admin will see a **5x5 Meter Grid** overlaid directly onto the building floorplan. By clicking and dragging, the Admin will "paint" the hallways and corridors green. 
- Painted squares = Safe Walking Corridors.
- Unpainted squares = Walls, Obstacles, or Unsafe areas.
- Red squares = Exits.

## 2. Dynamic Grid Calculation
Because every building map is a different scale, we will mathematically calculate the grid size based on your GPS calibration:
1. We calculate the physical distance (in meters) between your existing GPS calibration points.
2. We calculate the pixel distance between those same points on the image.
3. This gives us a `Pixels-Per-Meter` ratio!
4. The app dynamically draws grid squares that perfectly represent **5x5 physical meters** in the real world.

## 3. Database Schema Updates
We will add a new field to the Convex Database to store the grid:
```typescript
gridPaths: v.optional(v.array(v.object({
  row: v.number(),
  col: v.number(),
  lat: v.number(),   // Real-world GPS equivalent of the cell center
  lon: v.number(),
  isExit: v.boolean()
})))
```

## 4. The Admin Dashboard UI
- **Grid Overlay:** When the Admin clicks "Edit Route", a checkerboard grid appears over the map.
- **Painting Mechanic:** Using React Native's `PanResponder`, the admin can smoothly drag their finger/mouse across the screen to paint corridors green.
- **Eraser:** Tapping a green square removes it.
- **Exit Placement:** A toggle button switches the paintbrush to "Exit Mode" (paints squares red).

## 5. The Evacuation Routing Algorithm (A* Pathfinding)
In `EvacuationMode.tsx`:
1. **Snap to Grid:** When a user opens the app, their raw GPS coordinate is snapped to the nearest green grid square.
2. **Grid Adjacency:** The app knows that grid cells are connected if they are touching (up, down, left, right, diagonal). It completely ignores unpainted squares.
3. **A* Search:** It runs a flawless pathfinding search across the grid to find the absolute shortest continuous path of green squares to the nearest red Exit square.
4. **Smooth Direction:** The compass arrow dynamically points to the very next 5x5m square in the path. As the user walks, the path smoothly updates square-by-square, wrapping flawlessly around J-shapes or corners!

## Questions for User
- Should the Admin "Paintbrush" allow **diagonal** movement through the grid squares, or strictly **4-way** (Up/Down/Left/Right) movement down hallways? (Diagonal makes corners smoother).
