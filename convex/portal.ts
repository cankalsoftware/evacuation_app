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

    // For an admin, get their buildings and incidents for those buildings
    if (user.role === "admin") {
      const buildings = await ctx.db
        .query("buildings")
        .withIndex("by_admin", (q) => q.eq("adminId", user._id))
        .collect();

      const buildingIds = buildings.map((b) => b._id);
      
      // Fetch incidents for these buildings
      const incidents = [];
      for (const bId of buildingIds) {
        const bIncidents = await ctx.db
          .query("incidents")
          .withIndex("by_building_active", (q) => q.eq("buildingId", bId).eq("status", "active"))
          .collect();
        incidents.push(...bIncidents);
      }

      return {
        role: "admin",
        name: user.name,
        phone: user.phone,
        buildings,
        activeIncidents: incidents,
      };
    }

    // For a guest, we just return their profile info and maybe active incidents in their current building
    // (We'll expand this when we add GPS/Location check-ins)
    return {
      role: "guest",
      name: user.name,
      phone: user.phone,
      scannedPlanId: user.scannedPlanId,
      scannedPlanLat: user.scannedPlanLat,
      scannedPlanLon: user.scannedPlanLon,
      scannedAt: user.scannedAt,
      // Default to empty for now until they scan a building
      activeIncidents: [],
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
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, {
      scannedPlanId: args.storageId,
      scannedPlanLat: args.lat,
      scannedPlanLon: args.lon,
      scannedAt: Date.now(),
    });
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

export const triggerIncident = mutation({
  args: {
    clerkId: v.string(),
    buildingId: v.id("buildings"),
    type: v.union(v.literal("fire"), v.literal("active_shooter"), v.literal("earthquake"), v.literal("other")),
    severity: v.union(v.literal("low"), v.literal("high"), v.literal("critical")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) throw new Error("User not found");

    const incidentId = await ctx.db.insert("incidents", {
      buildingId: args.buildingId,
      type: args.type,
      severity: args.severity,
      status: "active",
      triggeredBy: user._id,
      startedAt: Date.now(),
    });

    return incidentId;
  },
});
