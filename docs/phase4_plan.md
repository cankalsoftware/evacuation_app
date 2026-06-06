# Phase 4: Dual-Role Portal Architecture

Now that authentication and location consent are secured, we need to build the actual application portals. 

In response to your question regarding "where to collect all other details":
We will add a simple "Settings/Profile" tab inside the portal where they can add their name and other details later without blocking them from initially using the app.

## User Review Required
> [!IMPORTANT]
> Based on your feedback, **Role Management** will be controlled via **Clerk's Public Metadata**.
> - **Source of Truth**: Clerk Dashboard (`user.publicMetadata.role = "admin"`).
> - **Syncing**: The frontend will read this metadata from Clerk and pass it down to Convex during the `syncUser` phase to ensure both frontend and backend know the user's correct role.
> - **Guest Experience**: Sees a panic button, a "Scan Evacuation Plan" button, and a settings icon.
> - **Admin Experience**: Sees a dashboard of active incidents, can upload floor plans, and can manually trigger evacuations.

## Proposed Changes

---

### Backend (Convex)

#### [MODIFY] `convex/schema.ts` & `convex/users.ts`
- Add an optional `name` field to the `users` table.
- Update `syncUser` to accept an optional `role` parameter. If provided, it will update the Convex user's role to match Clerk's `publicMetadata`.

#### [NEW] `convex/portal.ts`
- **`getDashboardData` (Query)**: Fetches the active incidents for the user's current location or managed buildings.
- **`triggerIncident` (Mutation)**: Allows a Guest or Admin to trigger an emergency in a specific building.
- **`updateProfile` (Mutation)**: Allows a user to save their Name and other details.

---

### Frontend UI (React Native)

#### [MODIFY] `components/MainScreen.tsx`
- We will read the user's metadata directly from Clerk: `const isAdmin = user?.publicMetadata?.role === 'admin';`
- If `isAdmin`, it will render `<AdminDashboard />`.
- If not, it will render `<GuestDashboard />`.

#### [NEW] `components/GuestDashboard.tsx`
- A sleek, high-contrast dashboard for guests.
- **Features**:
  - A massive, red "Trigger Panic" button.
  - A prominent "Scan Evacuation Plan" button (Phase 5).
  - A settings gear icon to update their Name.

#### [NEW] `components/AdminDashboard.tsx`
- A sophisticated control panel for building administrators.
- **Features**:
  - A list of their managed buildings.
  - An "Active Emergencies" feed.
  - A button to upload new Floor Plans (Phase 5).

## Verification Plan
1. Ensure the UI loads the Guest Dashboard by default.
2. Go to the Clerk Dashboard -> Users -> Edit your user -> Add `{"role": "admin"}` to Public Metadata.
3. Refresh the app and verify the UI instantly transforms into the Admin Dashboard.
