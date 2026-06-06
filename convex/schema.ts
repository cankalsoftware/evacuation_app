import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.optional(v.string()), // Optional until verified or provided
    phone: v.optional(v.string()), // User's telephone number
    name: v.optional(v.string()), // User's full name
    scannedPlanId: v.optional(v.id("_storage")),
    scannedPlanLat: v.optional(v.number()),
    scannedPlanLon: v.optional(v.number()),
    scannedAt: v.optional(v.number()),
    role: v.union(v.literal("guest"), v.literal("admin")),
    createdAt: v.number(),
  }).index("by_clerkId", ["clerkId"]),

  locationConsent: defineTable({
    userId: v.id("users"),
    hasConsented: v.boolean(),
    consentedAt: v.number(),
    ipAddress: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  buildings: defineTable({
    name: v.string(),
    address: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    googlePlaceId: v.optional(v.string()),
    adminId: v.id("users"),
  }).index("by_coordinates", ["latitude", "longitude"])
    .index("by_admin", ["adminId"]),

  rooms: defineTable({
    buildingId: v.id("buildings"),
    roomNumber: v.string(),
    floorLevel: v.number(),
    floorPlanUrl: v.string(), // Storage URL for the processed vector/raster floor plan
    exitPathData: v.string(),  // Stringified JSON coordinate array mapping nodes to the exit
  }).index("by_building_room", ["buildingId", "roomNumber"]),

  incidents: defineTable({
    buildingId: v.id("buildings"),
    type: v.union(v.literal("fire"), v.literal("active_shooter"), v.literal("earthquake"), v.literal("other")),
    severity: v.union(v.literal("low"), v.literal("high"), v.literal("critical")),
    status: v.union(v.literal("active"), v.literal("resolved")),
    triggeredBy: v.id("users"),
    startedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  }).index("by_building_active", ["buildingId", "status"]),
});
