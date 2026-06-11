# Phase 11 Plan: Unified Map Editor & Enhanced Routing

## Goal
The user wants to improve the Safe Routes editor by allowing multiple Exits, adding a toggle for Exits vs Turn Points, and ensuring the route editor is only accessible *after* the map is calibrated. To streamline this, we will merge the "Calibration" and "Safe Routes" processes into a single unified "Map Editor" modal.

## Proposed Design

We will replace the two separate modals (`isCalibrating` and `isRouting`) with a single `isMapEditorOpen` modal.

This modal will feature a **2-Step Workflow**:

### Step 1: Calibration (The Foundation)
- The admin is prompted to place the 4 corner pins (`TL`, `BL`, `TR`, `BR`).
- The "Next: Safe Routes" button is disabled until all 4 points are placed.
- If the building is already calibrated, the admin can freely switch between Step 1 and Step 2 using tabs at the top.

### Step 2: Safe Routes (The Layout)
- The map image remains exactly where it is, but the 4 calibration points stay visible (slightly faded) as a visual reference boundary.
- A new floating toolbar will be added at the bottom or top of the image:
  - `[ 🔵 Add Turn Point ]` (Default)
  - `[ 🚪 Add Exit ]` 
  - `[ ↩️ Undo Last ]`
  - `[ 🗑️ Clear All ]`
- The admin can drop multiple Exits. The guest's app will automatically route them to the *nearest* exit during an evacuation.

## Why this is better
1. **Prevents Errors**: The admin physically cannot draw routes until the calibration step is finished.
2. **Context**: Seeing the 4 calibration corners while drawing the safe routes gives the admin a sense of scale and boundaries.
3. **Flexibility**: Multiple exits are fully supported by the existing routing algorithm (which just looks for the nearest node marked `isExit: true`).
