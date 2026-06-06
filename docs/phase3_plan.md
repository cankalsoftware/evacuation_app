# Phase 3: Authentication & Location Consent Flow

This plan outlines the architecture for Phase 3 of the FireVision app, which involves securing the app with SMS-based authentication and gathering mandatory location tracking consent before letting users into the main application.

## User Review Required
> [!IMPORTANT]
> - We will be using **conditional rendering** instead of a heavy navigation router (like React Navigation or Expo Router) for this phase to keep the app lightweight and fast. The screen will dynamically swap between the Login, Consent, and Dashboard screens based on your Auth state.
> - We will use `expo-location` to handle the native OS location permission popups.

## Open Questions
- Do you want to restrict the app to specific phone numbers, or can anyone who downloads the app sign up as a "guest" by default? (My plan assumes anyone can sign up as a "guest").

## Proposed Changes

---

### Dependencies
#### [NEW] `expo-location`
- We will install `expo-location` to trigger the native iOS/Android location permission dialogs.

---

### Backend (Convex)
We will create queries and mutations to sync Clerk's authentication state with our Convex database.

#### [NEW] `convex/users.ts`
- **`syncUser` (Mutation)**: Called immediately after a user successfully logs in via Clerk. It will check if the user exists in our `users` table via their `clerkId`. If not, it creates a new user with the `"guest"` role.
- **`getUser` (Query)**: Retrieves the current logged-in user's profile.

#### [NEW] `convex/consent.ts`
- **`grantConsent` (Mutation)**: Creates a record in the `locationConsent` table for the current user.
- **`getConsentStatus` (Query)**: Checks if the current user has already granted location consent.

---

### Frontend UI (React Native)

#### [NEW] `components/AuthScreen.tsx`
- A beautiful, styled screen using NativeWind.
- **Step 1**: An input field for the user to enter their Phone Number.
- **Step 2**: Triggers Clerk's `useSignIn` / `useSignUp` to send an SMS.
- **Step 3**: An input field for the 6-digit OTP code to verify the login.

#### [NEW] `components/LocationConsentScreen.tsx`
- A screen explaining *why* the evacuation app needs location access (crucial for Apple/Google App Store review).
- Contains an "Allow Location Access" button.
- When clicked, it calls `Location.requestForegroundPermissionsAsync()`. If granted, it fires the Convex `grantConsent` mutation.

#### [NEW] `components/MainScreen.tsx`
- A temporary placeholder screen showing "Welcome to FireVision" that users see once they are fully authenticated and have granted location consent.

#### [MODIFY] `App.tsx`
- Refactor the component to act as our "State Router".
- It will read the state from Clerk (`useAuth()`) and Convex (`getConsentStatus`).
- **Routing Logic**:
  - If NOT logged in ➔ render `<AuthScreen />`
  - If logged in BUT no location consent ➔ render `<LocationConsentScreen />`
  - If logged in AND consented ➔ render `<MainScreen />`

## Verification Plan

### Automated Tests
- TypeScript compiler (`tsc`) will ensure the Convex schemas and Clerk hooks are strongly typed.

### Manual Verification
1. Open the app in the web browser (or phone).
2. Attempt to sign in with a real phone number.
3. Receive the SMS code, enter it.
4. Verify the UI transitions to the Location Consent Screen.
5. Click "Allow", verify the native browser/phone permission popup appears.
6. Verify the UI transitions to the Main Screen.
7. Check the Convex Dashboard to ensure the `users` and `locationConsent` rows were properly created.
