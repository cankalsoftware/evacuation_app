import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getDashboardData = query({
  args: { clerkId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!args.clerkId) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId!))
      .first();

    if (!user) return null;

    if (user.role === "admin") {
      const buildings = await ctx.db
        .query("buildings")
        .withIndex("by_admin", (q) => q.eq("adminId", args.clerkId!))
        .collect();

      return {
        role: "admin",
        name: user.name,
        phone: user.phone,
        buildings,
      };
    }

    const plan = await ctx.db
      .query("plans")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId!))
      .first();

    return {
      role: "guest",
      name: user.name,
      phone: user.phone,
      scannedPlanId: plan?.storageId,
      scannedPlanLat: plan?.latitude,
      scannedPlanLon: plan?.longitude,
      scannedAt: plan?.scannedAt,
      scannedPlanUrl: plan?.storageId ? await ctx.storage.getUrl(plan.storageId) : null,
    };
  },
});

export const generateUploadUrl = mutation(async (ctx) => {
  return await ctx.storage.generateUploadUrl();
});

export const uploadScannedPlan = mutation({
  args: {
    clerkId: v.string(),
    storageId: v.id("_storage"),
    lat: v.number(),
    lon: v.number(),
  },
  handler: async (ctx, args) => {
    const existingPlan = await ctx.db
      .query("plans")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existingPlan) {
      await ctx.db.patch(existingPlan._id, {
        storageId: args.storageId,
        latitude: args.lat,
        longitude: args.lon,
        scannedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("plans", {
        clerkId: args.clerkId,
        storageId: args.storageId,
        latitude: args.lat,
        longitude: args.lon,
        scannedAt: Date.now(),
      });
    }
  },
});

export const updateProfile = mutation({
  args: {
    clerkId: v.string(),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) throw new Error("User not found");

    const patchData: any = {};
    if (args.name !== undefined) patchData.name = args.name;
    if (args.phone !== undefined) patchData.phone = args.phone;

    await ctx.db.patch(user._id, patchData);
  },
});


