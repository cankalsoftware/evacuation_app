# Analysis of Indoor Positioning Technologies: Wi-Fi vs. Geomagnetism (Oriient)

This report evaluates our current indoor positioning strategy against Geomagnetic Indoor Positioning, the technology utilized by companies like **Oriient**.

## 1. Our Current Approach: Wi-Fi Fingerprinting + Dead Reckoning

Currently, our evacuation app relies on two primary data streams for indoor positioning:
1. **Wi-Fi Fingerprinting:** We map the signal strengths (RSSI) of various Wi-Fi routers (BSSIDs) throughout the building. The app matches the phone's current Wi-Fi readings against this database to estimate location.
2. **Dead Reckoning (Sensor Fusion):** We use the phone's accelerometer (pedometer/step counting) and gyroscope/compass (heading) to track movement between Wi-Fi scans.

**Strengths:**
- Utilizes existing Wi-Fi infrastructure; no new hardware to install.
- Relatively easy to implement using standard smartphone APIs.

**Weaknesses:**
- **Accuracy:** Usually accurate to around 5-10 meters. Wi-Fi signals bounce, fluctuate, and are absorbed by human bodies, causing "jumping" locations.
- **Latency:** Wi-Fi scans on mobile devices (especially iOS) are heavily throttled by the OS to save battery. You can only get updates every few seconds.

---

## 2. The Oriient Approach: Geomagnetic Fingerprinting

Companies like Oriient provide a **hardware-free** indoor positioning system that leverages the Earth’s natural magnetic field. 

### How it Works
Every modern building is constructed using steel beams, concrete reinforcement rebar, electrical wiring, and heavy machinery. These metal structures uniquely distort the Earth's natural magnetic field inside the building. 

1. **Mapping:** Just like our "Calibration Walk", an admin walks through the building holding their phone. Instead of recording Wi-Fi signals, the app records the invisible "magnetic landscape" using the phone's built-in **magnetometer** (compass sensor).
2. **Positioning:** When a user opens the app, the magnetometer reads the specific magnetic distortion around them and matches it to the magnetic map, pinpointing their location.

> [!NOTE]
> Because magnetic fields are entirely passive and constantly available, the phone's compass can read them at 50+ times per second without any battery drain or OS throttling.

---

## 3. Comparison & Impact on Evacuation

| Feature | Wi-Fi + Dead Reckoning | Geomagnetic (Oriient) |
| :--- | :--- | :--- |
| **Accuracy** | 5 - 10 meters (Room-level) | ~1 meter (Aisle/Desk-level) |
| **Infrastructure Required** | Existing Wi-Fi Routers | None (Uses the building's physical structure) |
| **Update Rate** | Slow (Throttled by OS) | Instant (50Hz+ sensor polling) |
| **Stability** | Fluctuates based on people/doors | Highly stable (Steel beams don't move) |
| **Device Support** | Limited on iOS (Apple blocks Wi-Fi scanning for developers) | Excellent (All phones have a compass) |

### Why is this relevant for Evacuation?

In a high-stakes emergency evacuation, **accuracy and latency are a matter of life and death**. 
- If a user is relying on Wi-Fi, the app might think they are in the hallway when they are actually inside a room, because Wi-Fi signals bleed through walls. 
- Furthermore, if the power goes out during a fire, **the Wi-Fi routers will turn off**, rendering our primary positioning system completely useless. The Earth's magnetic field, however, never turns off.

> [!WARNING]
> Power outages are the biggest vulnerability of Wi-Fi positioning in an evacuation scenario. 

---

## 4. Should We Implement Geomagnetic Positioning?

### The Case for "Yes"
If this app is intended for production-grade, life-saving scenarios, we **must** consider moving away from (or supplementing) Wi-Fi. 
1. **iOS Compatibility:** Apple fundamentally restricts developers from scanning Wi-Fi networks in the background or at high frequencies. A Wi-Fi-only app will struggle to function reliably on iPhones.
2. **Power Outage Resilience:** Geomagnetism works in pitch black with zero electricity. 
3. **Pinpoint Accuracy:** 1-meter accuracy means we can tell exactly which exit door the user is closest to, rather than just knowing they are generally in the "North Wing".

### The Challenge of Implementation
Building a Geomagnetic mapping engine from scratch is mathematically complex (it requires advanced signal processing, machine learning, and Dynamic Time Warping algorithms). 

If we choose to adopt this, we have two paths:
1. **Integrate an SDK:** We could license an SDK from companies like Oriient, IndoorAtlas, or Mapxus. This would instantly upgrade our app to 1-meter accuracy without needing to build the complex math ourselves.
2. **Build a Hybrid Baseline:** We can keep our current Wi-Fi implementation as a fallback, but aggressively improve our "Dead Reckoning" (Pedometer + Compass) to rely *less* on Wi-Fi and *more* on the user's physical steps. 

### Conclusion for Discussion
For the current phase of the prototype, our Wi-Fi + Dead Reckoning approach is sufficient to demonstrate the concept. However, if we plan to take this to a commercial or enterprise level, **geomagnetic positioning is the industry standard** for hardware-free indoor tracking, primarily because it bypasses Apple's Wi-Fi restrictions and survives power outages.
