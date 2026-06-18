import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const grantConsent = mutation({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if consent already exists
    const existingConsent = await ctx.db
      .query("locationConsent")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existingConsent) {
      if (!existingConsent.hasConsented) {
         await ctx.db.patch(existingConsent._id, {
            hasConsented: true,
            consentedAt: Date.now()
         });
      }
      
      const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
      if (user) {
        await ctx.db.patch(user._id, { permissionsGranted: true });
      }

      return existingConsent._id;
    }

    // Create new consent record
    const consentId = await ctx.db.insert("locationConsent", {
      clerkId: args.clerkId,
      hasConsented: true,
      consentedAt: Date.now(),
    });

    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (user) {
      await ctx.db.patch(user._id, { permissionsGranted: true });
    }

    return consentId;
  },
});

export const getConsentStatus = query({
  args: { clerkId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!args.clerkId) return false;

    const consent = await ctx.db
      .query("locationConsent")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId!))
      .first();

    return consent?.hasConsented ?? false;
  },
});
