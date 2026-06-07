import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.optional(v.string()), // Optional until verified or provided
    phone: v.optional(v.string()), // User's telephone number
    name: v.optional(v.string()), // User's full name
    // Legacy fields (kept optional to prevent schema validation crashes on old records)
    scannedPlanId: v.optional(v.id("_storage")),
    scannedPlanLat: v.optional(v.number()),
    scannedPlanLon: v.optional(v.number()),
    scannedAt: v.optional(v.number()),
    
    role: v.union(v.literal("guest"), v.literal("admin")),
    createdAt: v.number(),
  }).index("by_clerkId", ["clerkId"]),

  plans: defineTable({
    clerkId: v.string(),
    storageId: v.id("_storage"),
    latitude: v.number(),
    longitude: v.number(),
    scannedAt: v.number(),
    roomNumber: v.optional(v.string()),
    floorLevel: v.optional(v.string()),
  }).index("by_clerkId", ["clerkId"]),

  locationConsent: defineTable({
    clerkId: v.optional(v.string()), // Optional to prevent crashing on old records
    userId: v.optional(v.id("users")), // Legacy support
    hasConsented: v.boolean(),
    consentedAt: v.number(),
    ipAddress: v.optional(v.string()),
  }).index("by_clerkId", ["clerkId"]),

  buildings: defineTable({
    name: v.string(),
    address: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    googlePlaceId: v.optional(v.string()),
    adminId: v.string(),
    polygon: v.optional(v.array(
      v.object({ lat: v.number(), lon: v.number() })
    )), // Complex polygon boundary of the building
    masterPlanId: v.optional(v.id("_storage")),
  }).index("by_coordinates", ["latitude", "longitude"])
    .index("by_admin", ["adminId"]),

  rooms: defineTable({
    buildingId: v.id("buildings"),
    roomNumber: v.string(),
    floorLevel: v.number(),
    floorPlanUrl: v.string(), // Storage URL for the processed vector/raster floor plan
    exitPathData: v.string(),  // Stringified JSON coordinate array mapping nodes to the exit
  }).index("by_building_room", ["buildingId", "roomNumber"]),
});
