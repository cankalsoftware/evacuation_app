# Add Header Comments to Components

The goal is to implement good coding practices by adding informative header comments to every file in the `components/` folder. These comments will explain what the file is, what it does, and document the inputs/outputs and logic of key functions.

## Proposed Changes

We will modify the following 11 files in the `components/` directory to include comprehensive JSDoc-style comments:

### Components

#### [MODIFY] [AdminDashboard.tsx](file:///c:/Users/uyko7/Documents/VSCode/evacuation_app/components/AdminDashboard.tsx)
- Add a file header explaining its role as the primary interface for building administrators.
- Document state variables and major functions (e.g., building registration, scanning, roll call triggers).

#### [MODIFY] [GuestDashboard.tsx](file:///c:/Users/uyko7/Documents/VSCode/evacuation_app/components/GuestDashboard.tsx)
- Add a file header detailing its role as the end-user/guest interface for daily operations and emergency alerts.
- Document functions handling permissions, background location syncing, and evacuation plan scanning.

#### [MODIFY] [AuthScreen.tsx](file:///c:/Users/uyko7/Documents/VSCode/evacuation_app/components/AuthScreen.tsx)
- Document the Clerk-based authentication flows (Sign In, Registration, Passkeys, OTP verification).

#### [MODIFY] [EvacuationMode.tsx](file:///c:/Users/uyko7/Documents/VSCode/evacuation_app/components/EvacuationMode.tsx)
- Document the active emergency interface, including the map tracking, safe zone rendering, and WebRTC walkie-talkie communication logic.

#### [MODIFY] [LiveRollCall.tsx](file:///c:/Users/uyko7/Documents/VSCode/evacuation_app/components/LiveRollCall.tsx)
- Document the admin-side real-time roll call dashboard, sorting logic, and walkie-talkie controls.

#### [MODIFY] [ProfileSettingsScreen.tsx](file:///c:/Users/uyko7/Documents/VSCode/evacuation_app/components/ProfileSettingsScreen.tsx)
- Document the user profile modal, profile updating logic, and permission toggles.

#### [MODIFY] [PlanScannerModal.tsx](file:///c:/Users/uyko7/Documents/VSCode/evacuation_app/components/PlanScannerModal.tsx)
- Document the plan scanning and AI analysis fallback logic.

#### [MODIFY] [LocationConsentScreen.tsx](file:///c:/Users/uyko7/Documents/VSCode/evacuation_app/components/LocationConsentScreen.tsx)
- Document the initial onboarding screen for location and notification permissions.

#### [MODIFY] [MainScreen.tsx](file:///c:/Users/uyko7/Documents/VSCode/evacuation_app/components/MainScreen.tsx)
- Document the top-level routing logic that decides whether to show the Admin Dashboard, Guest Dashboard, or Auth screen.

#### [MODIFY] [ResponsiveUI.tsx](file:///c:/Users/uyko7/Documents/VSCode/evacuation_app/components/ResponsiveUI.tsx)
- Document the custom UI primitives (Text, TouchableOpacity, TextInput) that scale with screen size.

#### [MODIFY] [Toast.tsx](file:///c:/Users/uyko7/Documents/VSCode/evacuation_app/components/Toast.tsx)
- Document the custom global notification/toast system.

## Verification Plan
1. Ensure the app continues to compile and run without syntax errors (`npx expo start --dev-client -c`).
2. Verify that no existing code logic is altered during the documentation process.
