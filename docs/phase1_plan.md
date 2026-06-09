# FireVision.uk - Active Indoor Life Safety Navigation System

An active, real-time indoor life safety navigation system extending `firevision.uk`. Moves from passive regulatory compliance tracking to real-time evacuation navigation using a reactive architecture.

## User Review Required

> [!IMPORTANT]
> Please review the data schemas and proposed architecture to confirm they meet your exact structural vision before we begin code generation. 
> Ensure your Clerk, Convex, and Google Developer accounts are ready for project setup and API key retrieval.

## Open Questions

- Should we include Google Maps API keys directly in the Expo environment or will we rely entirely on Convex background actions for any mapping heavy lifting?
- Do you already have the Google Cloud Project set up with Maps API and Gemini Flash API enabled?

## Proposed Architecture

```mermaid
graph TD
    A[React Native / Expo Mobile Client] -->|Auth| B[Clerk]
    A -->|Real-time Sync| C[Convex DB]
    A -->|Location/Maps/Vision| D[Google Maps API / Gemini Flash AI]
    B <--> C
```

**Frontend:** React Native with **Expo** (essential for swift compilation, cross-platform background location access, audio engines, and native Google Play deployment pipelines).
**Backend & Database:** **Convex** (ultra-low latency, WebSocket-based backend).
**Authentication:** **Clerk** (user identities, phone number verification, multi-tenant JWT session tokens integrated with Convex).
**Core Native Subsystems:** `expo-location` (GPS boundary tracking), `expo-camera` (image capture), and `expo-speech` (turn-by-turn audio directions).

## Process Details for Accounts (Clerk, Convex, Google)

> [!NOTE]
> You mentioned having accounts in Clerk, Convex, and Google. Here is where and how they will be linked:

### Clerk Account
- **Usage:** Managing secure user identities, SMS OTP verification, and multi-tenant JWTs.
- **Action:** Create a new Application in Clerk.
- **Integration:** 
  - Retrieve the publishable key (e.g. `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`).
  - Configure a JWT Template in Clerk named "convex" to allow secure Convex integration.
  - Add this key to the Expo project's `.env` file.

### Convex Account
- **Usage:** Real-time database, background automated actions, and file storage for floor plans/images.
- **Action:** Create a new project in the Convex dashboard.
- **Integration:** 
  - Retrieve the `CONVEX_DEPLOYMENT` and `EXPO_PUBLIC_CONVEX_URL` keys.
  - Link Convex with Clerk by adding the Clerk Issuer URL in Convex's `auth.config.js`.
  - Push the database schema to Convex.

### Google Account (Google Cloud / Google Play)
- **Usage:** Maps API, Gemini Flash Vision AI (for image ingestion), and Android app distribution.
- **Action:** 
  - **Google Cloud Console:** Create a project, enable Maps SDK for Android/iOS, and enable Vertex AI / Gemini API.
  - **Google Play Console:** Set up the app for publishing, handle internal testing track, and complete the Data Safety Form.
- **Integration:** 
  - Retrieve API keys for Maps and Gemini. Provide them to the Expo client (Maps) and Convex backend (Gemini).

## Proposed Changes

---

### Phase 1: Database Schema & Authentication Configuration

We will create the Convex data model to track guests, admins, buildings, rooms, and incidents.

#### [NEW] [schema.ts](file:///c:/Users/uyko7/Documents/VSCode/evacuation_app/convex/schema.ts)
Schema setup with strict indexing:
- `users`: Track clerkId, phone, role (guest/admin).
- `locationConsent`: Compliance tracking for location sharing.
- `buildings`: Building details and coordinates.
- `rooms`: Floor plans and exit path data.
- `incidents`: Real-time incident triggers.

#### [NEW] [auth.config.ts](file:///c:/Users/uyko7/Documents/VSCode/evacuation_app/convex/auth.config.ts)
Configuration linking Clerk JWTs to Convex authentication.

---

### Phase 2: Core Step-by-Step Development Roadmap

#### 1. Project Initialization
- Run Expo initialization (`npx create-expo-app@latest -t expo-template-blank-typescript`) in `c:/Users/uyko7/Documents/VSCode/evacuation_app`.
- Install Tailwind/NativeWind.
- Install `convex`, `convex-react-client`, `@clerk/clerk-expo`.
- Set up `/components` and `/hooks`.

#### 2. Clerk Authentication & Consent Flow
- SMS OTP Verification screen.
- Mandatory, un-skippable **Location Consent Screen**.
- Convex mutation to write to `users` and `locationConsent`.

#### 3. Dual-Role Portal Architecture
- **Guest UI:** Minimalist home screen, "SCAN ROOM EVACUATION PLAN" button, manual trigger.
- **Admin Dashboard:** Building occupancy view, floor plan upload, and "TRIGGER BUILDING EVACUATION" mechanism.

#### 4. Image Ingestion Engine
- Use `expo-camera` to capture evacuation sign.
- Upload to Convex storage.
- Convex Action passes asset to **Gemini Flash Vision AI**.
- Return JSON block mapping room ID to layout.

#### 5. Reactive Evacuation Navigation Engine
- Convex query listening to `incidents` table.
- Trigger high-intensity audio/visual alarms.
- Display `exitPathData` dynamically over the floor plan.
- Use `expo-speech` for audio turn-by-turn guidance synchronized with visual updates.

## Verification Plan

### Local Testing Plan
- **Setup Expo Go / Prebuild:** Run the application locally on an iOS/Android device via the Expo Go app or development build (`npx expo start`).
- **Convex Dev DB:** Use the Convex local development database (`npx convex dev`) to manually trigger an incident and verify the real-time sync latency (<100ms).
- **Clerk Testing:** Use Clerk's development mode and test phone numbers to verify OTP flows without incurring SMS costs.
- **Simulated Navigation:** Mock location coordinates in the local simulator to test `expo-speech` instructions and path overlay rendering on the frontend.
- **Vision AI Mocking:** Test the `expo-camera` functionality and verify Convex Actions are successfully calling the Google Vision API (Gemini Flash) with sample sign images.

### Automated Tests
- Convex unit tests for schema validation and database mutations (e.g. testing the incident trigger updates).

### Manual Verification
- Using a physical test device to walk a mapped path and verify step-counter / proximity updates trigger the next audio cue appropriately.
- Testing the Google Play Console internal testing track by distributing the `.aab` to QA partners.
