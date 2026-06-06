import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const grantConsent = mutation({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Check if consent already exists
    const existingConsent = await ctx.db
      .query("locationConsent")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (existingConsent) {
      if (!existingConsent.hasConsented) {
         await ctx.db.patch(existingConsent._id, {
            hasConsented: true,
            consentedAt: Date.now()
         });
      }
      return existingConsent._id;
    }

    // Create new consent record
    const consentId = await ctx.db.insert("locationConsent", {
      userId: user._id,
      hasConsented: true,
      consentedAt: Date.now(),
    });

    return consentId;
  },
});

export const getConsentStatus = query({
  args: { clerkId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!args.clerkId) return false;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId!))
      .first();

    if (!user) return false;

    const consent = await ctx.db
      .query("locationConsent")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    return consent?.hasConsented ?? false;
  },
});
