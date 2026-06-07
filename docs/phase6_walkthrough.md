# Phase 6 Execution Complete: Active Guidance System

I have successfully executed the final plan for Phase 6. We now have a robust, AI-powered Evacuation flow built right into the app!

## What was built

### 1. AI Vision Pre-population
When a user uploads a new Evacuation Plan picture in the dashboard, the app now instantly uploads it to your secure Convex storage, and passes the URL to a new Server Action (`convex/vision.ts`). This action uses your saved `GEMINI_API_KEY` to "look" at the image and extract the **Room Number** and **Floor Level**. 
- The user is then presented with a Modal containing these AI-extracted values. They can edit them if the AI made a mistake, and press **Confirm** to lock in their anchor!

### 2. The "Evacuate" Mode
If you click the giant **Panic** button after a plan is scanned, the app now launches the new `EvacuationMode` screen. This screen features:
- **Heads-Up Map Display:** Your scanned plan is displayed with slight transparency over a dark UI.
- **Intelligent Compass Arrow:** Using `expo-location`'s magnetic compass, a large arrow is drawn on screen. It rotates dynamically as you turn your phone.
- **Red/Green Warning System:** For this prototype, I have hardcoded the "Safe Route" heading to North (0 degrees) as an example. If you face North, the arrow is **Green** and says "Safe Route". If you turn around, the arrow instantly turns **Red** and says "Wrong Way".
- **Voice Prompts:** Powered by `expo-speech`, the phone will literally talk to you. It announces the evacuation, and if you turn the wrong way, it will verbally warn you to "Turn around".

## How to Test

> [!IMPORTANT]
> Because Web Browsers (like Chrome on your PC) do not have internal magnetic compasses, the arrow will not spin if you test this on your computer. 
> 
> To test the full AI extraction, the Voice Commands, and the Rotating Red/Green Compass, **I highly recommend opening the Expo Go app on your physical iPhone or Android device.**

1. Click **Scan Evacuation Plan** (You can upload the sample `fireescapeplanhotel.jpg` from your PC).
2. Wait a few seconds for the **AI Analyzing...** step to finish.
3. See the AI accurately pre-fill the Room Number!
4. Click **Confirm**.
5. Click the massive red **Panic** button to enter Evacuation Mode.
