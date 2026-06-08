# Phase 7: Admin Geo-Anchoring & Auto-Push

You are absolutely right: buildings are rarely perfect rectangles. An L-shaped or H-shaped building requires a "Polygon" rather than a simple square. By defining the exact footprint of the building, we can map the image perfectly and know if a user is inside or outside.

## 1. Complex Polygon Footprints

1. **The Admin Uploads the Map:** The Admin uploads the blueprint to the Dashboard.
2. **Polygon Pinning:** Using an integrated Google Map view, the Admin clicks to drop pins around the perimeter of the building. 
   - A minimum of 4 pins is strictly required to save the map.
   - They can add 5, 6, or 10+ pins to trace complex L, W, or H shapes.
3. **The Math Engine:** We use a "Polygon Point-in-Polygon" algorithm. If the user's GPS dot falls inside the polygon drawn by the Admin, we know exactly where they are on the blueprint.

## 2. Linking Admins and Users: Auto-Push (Geo-Fencing)

Since the Admin just drew the exact GPS polygon of the building, the app can be completely automated using an Auto-Push Geo-Fence.
- **How it works:** When a User opens the app and hits "Scan/Locate", the app checks their raw GPS. If they are standing inside the Admin's polygon, the server automatically "pushes" the Admin's map to their screen. No codes or scanning needed!

## The Technical Execution Plan (MVP)

### 1. Update the Database (`buildings` table)
We replace the simple bounds with an array of polygon coordinates:
```typescript
polygon: v.array(
  v.object({ lat: v.number(), lon: v.number() })
) // Minimum 4 items required
```

### 2. The Admin UI (`AdminDashboard.tsx`)
We embed a React Native Map in the dashboard. The Admin clicks the map to drop pins, drawing the shape of their building. We enforce a minimum of 4 pins before the "Save" button unlocks.

---

## Phase 7.5: Admin Onboarding & Role Selection

### 1. Role Selection on Signup
- Add a Role Selection toggle (Guest vs Facility Admin) below the email input on `AuthScreen.tsx`.
- Store the selected role locally in `SecureStore` so the app remembers what they chose while Clerk handles the OTP email.

### 2. Database Sync
- Update `App.tsx` `syncUser` to read the chosen role from `SecureStore` and pass it to Convex.
- Convex registers the new user in the database with the requested role.

### 3. Admin Profile Setup Page
- Add a check in `AdminDashboard.tsx`: `if (!dashboardData.name || !dashboardData.phone)`.
- If true, force the user to complete the `AdminSetupView`.
- Provide a gear icon ⚙️ next to the Sign Out button to access this setup page later to edit their details.

### 4. Backend Mutation
- Create `updateAdminProfile(clerkId, name, phone)` in `convex/users.ts`.

---

## Phase 7.6: Authentication Redesign
Transition from a purely passwordless (Email OTP every time) login to a traditional Password-based authentication system to speed up logins for returning users.

### 1. New Registration Flow (New Users)
- Requires Email, Password, and an OTP verification code sent to their email to prove ownership and stop bots.
- User selects Guest or Admin role during registration.

### 2. New Login Flow (Returning Users)
- Only requires Email and Password. 
- No OTP required to log in.

### 3. UI Changes (`AuthScreen.tsx`)
- Replace the "FireVision" text with the uploaded `FireVision.png` logo.
- Add a tab toggle at the top of the form to switch between "Sign In" and "Register".
- Add a **Password** `<TextInput>` field below the Email field.

### 3. The Guest UI (`EvacuationMode.tsx`)
When the Guest app initializes, we send their live GPS to Convex. Convex runs a "Ray-Casting" algorithm to check if their coordinate falls inside *any* of the Admin polygons. If it does, they instantly receive the Evacuation Plan!
