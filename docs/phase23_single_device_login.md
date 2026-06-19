# Phase 23: Single Device Login Enforcement

## Objective
Enforce a strict "one active device per account" rule. If a user logs into a new device, they will receive a warning. If they proceed, their previous device will be forcefully and automatically logged out to prevent multi-device concurrent access.

## Architecture: The "Auto-Kick" Method
To prevent permanent account lockouts (e.g., if a user loses their phone and cannot explicitly "log out"), we implement an active session tracking system.

1. **Device Fingerprinting**: 
   - Upon app initialization, we generate a unique UUID (`DEVICE_ID`) and persist it in `expo-secure-store` (Mobile) or `localStorage` (Web).
   - This ensures the device maintains a consistent identity across app restarts.

2. **Database Tracking**:
   - `convex/schema.ts`: Add `activeDeviceId: v.optional(v.string())` to the `users` table.
   - `convex/users.ts`: Create mutations to register a device ID upon login.

3. **Authentication Warning**:
   - `AuthScreen.tsx`: When a user attempts to log in, we check if the account's `activeDeviceId` is already set and belongs to a different device.
   - If true, display a warning: *"You are currently logged in on another device. Logging in here will log you out of your previous device. Continue?"*

4. **Real-time Enforcer (Auto-Kick)**:
   - `App.tsx`: An active Convex subscription monitors the logged-in user's `activeDeviceId`.
   - If the database `activeDeviceId` changes and no longer matches the local persistent `DEVICE_ID` (meaning they logged in elsewhere), `App.tsx` immediately invokes Clerk's `signOut()` function, destroying the local session and booting them to the Auth Screen.

## Tasks
- [x] Add `activeDeviceId` to Convex schema.
- [x] Implement `getOrCreateDeviceId` utility using `uuid` and `SecureStore`/`localStorage`.
- [x] Update `App.tsx` to handle the real-time logout subscription.
- [x] Update `App.tsx` (RootNavigator) to warn users and enforce the device transfer.

## Implementation Walkthrough

The Single Device Auto-Kick functionality has been successfully integrated.

### 1. Persistent Device Fingerprinting
We created a new utility (`utils/device.ts`) that safely generates a persistent UUID unique to the physical device. It utilizes `expo-secure-store` on iOS/Android and `localStorage` on Web to ensure the device identity persists across app restarts.

### 2. Backend Database Tracking
We extended the Convex `users` schema to track the `activeDeviceId`. Now, whenever a user successfully logs in, the backend securely anchors their account to that specific device.

### 3. Collision Warning Interceptor
Before the app mounts, `App.tsx` silently queries Convex. If the account is already locked to a different device, it pauses the login sequence and displays a full-screen warning: *"You are currently logged in on another device. If you proceed, the other device will be automatically logged out."* The user can either "Cancel Login" or "Log Out Other Device & Continue".

### 4. Real-time Auto-Kick Protocol
Because `App.tsx` uses a live `useQuery` subscription, the moment the database's `activeDeviceId` changes (because they clicked "Continue" on their new device), the old device instantly detects the change, triggers the Clerk `signOut()` method, and forcefully ejects the session.

> **Tip:** This "Auto-Kick" architecture completely eliminates the "Lost Device" bug. Even if a user's browser crashes or their phone breaks, they are never permanently locked out of their account, because they have the power to forcefully migrate their session to their new device.
