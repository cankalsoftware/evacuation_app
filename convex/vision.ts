/**
 * @file vision.ts
 * @description Integrates with the Google Gemini / OpenAI Vision API to automatically parse
 * floor numbers, room numbers, and textual metadata from images of evacuation plans uploaded by users.
 * 
 * @module ConvexVision
 */
import { action } from "./_generated/server";
import { v } from "convex/values";

export const extractMapDetails = action({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    try {
      const imageUrl = await ctx.storage.getUrl(args.storageId);
      if (!imageUrl) {
        throw new Error("Could not get URL for image");
      }

      // If GEMINI_API_KEY is not set in Convex dashboard, return null gracefully so user can manually enter
      if (!process.env.GEMINI_API_KEY) {
        console.warn("GEMINI_API_KEY not set in Convex environment. Skipping AI extraction.");
        return null;
      }

      // Fetch the image to get base64
      const imageResponse = await fetch(imageUrl);
      const arrayBuffer = await imageResponse.arrayBuffer();
      
      // Convert to base64 without using Buffer (compatible with Edge runtimes)
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Image = btoa(binary);
      
      const mimeType = imageResponse.headers.get("content-type") || "image/jpeg";

      // Call Gemini API
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
      
      const payload = {
        contents: [{
          parts: [
            { text: "You are an AI assistant analyzing a hotel fire escape plan. Please look at the image and extract two pieces of information: 1) The Room Number where the 'You Are Here' marker is located. 2) The Floor Level (if visible). Return ONLY a JSON object with keys 'roomNumber' and 'floorLevel'. If you cannot find one, set it to null. Example: {\"roomNumber\": \"204\", \"floorLevel\": \"2\"}" },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Image
              }
            }
          ]
        }]
      };

      const aiResponse = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const aiData = await aiResponse.json();
      
      if (!aiData.candidates || aiData.candidates.length === 0) {
        console.error("Gemini returned no candidates:", aiData);
        return null;
      }

      const textOutput = aiData.candidates[0].content.parts[0].text;
      
      // Clean up markdown code block if present
      const jsonStr = textOutput.replace(/```json/g, "").replace(/```/g, "").trim();
      
      try {
        const parsed = JSON.parse(jsonStr);
        return {
          roomNumber: parsed.roomNumber ? String(parsed.roomNumber) : null,
          floorLevel: parsed.floorLevel ? String(parsed.floorLevel) : null,
        };
      } catch (e) {
        console.error("Failed to parse Gemini JSON:", jsonStr, e);
        return null;
      }
      
    } catch (error) {
      console.error("Error in extractMapDetails action:", error);
      return null;
    }
  },
});
