# Phase 6: Indoor Mapping & Evacuation Guidance Strategy

Now that we have successfully captured the user's floor plan and secured their general location, the next major hurdle is: **How do we actually guide them to safety during an emergency?**

I have analyzed the `fireescapeplanhotel.jpg` image you provided. Based on that image, here is a breakdown of the technical challenges and proposed solutions.

## The GPS Problem

> [!WARNING]
> We **cannot** use standard GPS to guide users inside a building. 
> GPS accuracy is typically 5 to 15 meters outdoors, and much worse indoors due to thick walls and ceilings blocking satellite signals. GPS will tell us the user is "in the hotel," but it cannot reliably distinguish if they are in Room 204, Room 205, or even on the 2nd vs 3rd floor.

## How do we know where the user is?

The brilliant part about your design is having the user take a picture of the evacuation plan *on the back of their door*. 

If you look at the sample image, it explicitly contains a blue **"YOU ARE HERE"** dot in Room 204. Because the user took the picture from their room, the picture *is* their location check-in!

### Approach 1: The Passive "Digital Memory" (Simplest)
Since the physical map already has green arrows drawn from "You Are Here" to the exit, the simplest MVP is to simply store this image. During an emergency, the user opens the app, and we display this exact image to them, perhaps highlighting it to be highly visible.
- **Admin Input:** None required.
- **User Input:** Just uploading the photo.

### Approach 2: AI Image Extraction (Dynamic)
If we want the app to actively guide them, we can use a Vision AI model (like Google Gemini Vision) running in the cloud. When the user uploads the image:
1. The AI scans the image and finds the "YOU ARE HERE" dot.
2. The AI reads the room number closest to the dot (e.g., "Room 204").
3. We save "User is in Room 204" to the database.
- **Admin Input:** None required.
- **User Input:** Just uploading the photo.

### Approach 3: Admin Master Maps + Dynamic Routing (Most Advanced)
What happens if the primary exit (the green arrows on the door) is blocked by a fire? The static map on the door becomes dangerous. 
To solve this, we need the Admin dashboard.
1. **Admin Input:** The Admin uploads a clean, master blueprint of the hotel floor. Using a web interface, the admin clicks to draw "nodes" (Room 204, Room 205, Corridor A, Stairwell B).
2. **User Input:** The user takes a picture of their door map. Our AI reads it and says "This user is in Room 204".
3. **Emergency:** An incident is triggered (e.g., Fire in the East Stairwell). Our backend calculates a safe path from Room 204 to the West Stairwell, avoiding the fire, and sends an interactive, live map to the user's phone.

## Open Questions

> [!IMPORTANT]
> How advanced do you want this guidance to be for the upcoming versions?
> 
> **Option A (Static/Personal):** We just enhance and display the exact image they uploaded so they have it on their phone if the hallway is filled with smoke and they can't read the signs.
> 
> **Option B (AI Assisted):** We use AI to read the image they uploaded, trace the green arrows, and turn those 2D arrows into an animated line on their screen.
> 
> **Option C (Admin Master Controlled):** The Admin must pre-map the building in the dashboard. The user's photo is only used by AI to detect their Room Number so we can place them on the Admin's master map.

What do you think is the best balance of effort vs. utility for this stage of the app?
