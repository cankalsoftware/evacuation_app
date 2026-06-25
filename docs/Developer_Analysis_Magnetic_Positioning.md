# Developer Analysis: Building vs. Buying Magnetic Positioning

This document provides a technical breakdown of how we can leverage the phone's compass/magnetometer to improve our current system, and what it would actually take to build a full geomagnetic positioning engine from scratch.

---

## 1. Improving Current Wi-Fi + Dead Reckoning

We don't need to build a massive magnetic fingerprinting engine to get *some* value out of the compass. We can drastically improve our current "Dead Reckoning" (Pedometer + Wi-Fi) by using the magnetometer for **Heading Correction**.

### Current Problem
Currently, dead reckoning relies on the gyroscope and accelerometer to detect steps and direction. However, gyroscopes suffer from **drift**—over time, the phone thinks "North" is slowly rotating, causing the user's estimated path on the map to curve into walls.

### The Improvement (Sensor Fusion)
We can use the phone's magnetometer as an absolute reference to correct gyroscope drift.
1. **Step Detection:** Accelerometer detects a footstep.
2. **Heading Estimation:** Gyroscope estimates the turn angle.
3. **Compass Correction:** Magnetometer locks the absolute heading to True North.
4. **Map Snapping:** We apply a "Map Matching" algorithm. If the user is walking down a hallway, and the sensors say they walked 5 degrees into the wall, the algorithm snaps their trajectory perfectly parallel to the hallway walls on our grid.

**Developer Effort:** Medium (2-4 weeks). We would need to implement a **Kalman Filter** or a **Complementary Filter** in React Native (or via Expo sensors) to fuse the Accelerometer, Gyroscope, and Magnetometer data into a single, clean "Heading Vector".

---

## 2. Building a True Magnetic Positioning System from Scratch

If we want to achieve the 1-meter accuracy of Oriient without paying for their SDK, we have to build a "Magnetic Fingerprinting Engine". Here is the developer reality of what this entails.

### The Technical Requirements

To build this, we are no longer just building a React Native app; we are building a **Signal Processing and Machine Learning pipeline**.

#### A. The Calibration App (Data Collection)
- **What it does:** The admin walks the building, collecting magnetometer data at 50Hz (50 times a second).
- **The Challenge:** The data is incredibly noisy. We have to map raw 3-axis magnetic vectors (X, Y, Z in microteslas) to physical X, Y coordinates on the floor plan. If the admin walks slower or faster, the data stretches and compresses.

#### B. The Algorithm: Dynamic Time Warping (DTW)
- **What it does:** When a user walks, they create a sequence of magnetic readings over time. The system must compare this new time-sequence against the spatial map we recorded during calibration.
- **The Challenge:** Users walk at different speeds, hold their phones at different angles (in pocket, in hand, texting), and take different routes. We have to implement **Dynamic Time Warping**, an algorithm that matches sequences of different speeds and lengths.

#### C. The Positioning Engine: Particle Filters
- **What it does:** Because a single magnetic reading (e.g., 45 microteslas) isn't unique—hundreds of spots in a building might have that exact reading—we have to track a sequence.
- **The Challenge:** We must implement a **Particle Filter** (Monte Carlo Localization). The app generates thousands of virtual "particles" representing possible user locations. As the user walks, the algorithm compares the real magnetic sequence to what each particle *would* experience. Particles that don't match are killed; particles that match multiply. Over 5-10 steps, the particles converge on the user's exact location.

### Timeline & Resource Estimate

Building this from scratch is a massive undertaking. It is a specialized field of engineering.

| Phase | Developer Requirements | Estimated Time |
| :--- | :--- | :--- |
| **Data Collection & Cleaning** | Native iOS/Android sensor management to bypass React Native bridge limits. | 1-2 Months |
| **Algorithm Development** | Python/C++ engineer to build DTW and Particle Filter engines. | 3-4 Months |
| **Mobile Integration** | Porting the C++ algorithms to run efficiently on mobile (WASM or Native Modules). | 2 Months |
| **Testing & Edge Cases** | Handling different phone hardware, pocket vs hand, elevators. | Ongoing |

**Total Estimated Effort:** ~6-8 Months of dedicated R&D by a developer with a background in robotics or signal processing.

---

## 3. The SDK Alternative (Oriient, Mapxus, IndoorAtlas)

If we use an SDK, companies like Oriient have already spent 5+ years and millions of dollars solving the DTW, Particle Filter, and cross-device calibration problems.

**How SDK Integration Works:**
1. We install their React Native SDK (`npm install @oriient/sdk`).
2. We use their calibration app to walk the building.
3. We pass their SDK our floor plan IDs.
4. We call `Oriient.startPositioning()`, and the SDK simply fires a callback every second: `{ x: 145, y: 322, floor: 2, accuracy: 1.2m }`.

**Developer Effort:** Low (1-2 weeks). It becomes a standard API integration.

### Conclusion

Building a magnetic positioning engine from scratch is **not a feature; it is an entire product.** 
If our core business value is the *Evacuation Logic* (the grid, the safe routing, the admin dashboard, the emergency alerts), we should absolutely **not** build magnetic positioning from scratch. We should either:

1. **Short Term:** Implement basic Sensor Fusion (Compass + Pedometer) to smooth out our Wi-Fi jumps.
2. **Long Term:** License an SDK like Oriient or IndoorAtlas to handle the deep tech of 1-meter tracking, allowing us to focus 100% on the Evacuation and Safety features.
