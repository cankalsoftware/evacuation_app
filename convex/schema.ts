import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.optional(v.string()), // Optional until verified or provided
    phone: v.optional(v.string()), // User's telephone number
    name: v.optional(v.string()), // User's full name
    
    role: v.union(v.literal("guest"), v.literal("admin")),
    createdAt: v.number(),
    expoPushToken: v.optional(v.string()), // Added for Phase 13 native push notifications
    activeBuildingId: v.optional(v.id("buildings")), // Phase 15: Background Check-in Tracking
  }).index("by_clerkId", ["clerkId"]),

  plans: defineTable({
    clerkId: v.string(),
    storageId: v.id("_storage"),
    latitude: v.number(),
    longitude: v.number(),
    scannedAt: v.number(),
    roomNumber: v.optional(v.string()),
    floorLevel: v.optional(v.string()),
    exitNode: v.optional(v.object({ x: v.number(), y: v.number() })), // Added for Phase 9 guest scans
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
    siteName: v.optional(v.string()),
    address: v.string(),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    googlePlaceId: v.optional(v.string()),
    adminId: v.string(),
    polygon: v.optional(v.array(
      v.object({ lat: v.number(), lon: v.number(), label: v.optional(v.string()) })
    )), // Complex polygon boundary of the building
    imageCalibrationPoints: v.optional(v.array(
      v.object({ x: v.number(), y: v.number() })
    )), // Added for Phase 9 image to GPS mapping
    safeNodes: v.optional(v.array(
      v.object({ lat: v.number(), lon: v.number(), isExit: v.boolean() })
    )), // Added for Phase 9 Admin routing
    masterPlanId: v.optional(v.id("_storage")),
    nextDrillAt: v.optional(v.number()), // Phase 13
    drillJobId: v.optional(v.id("_scheduled_functions")), // Phase 13
    lastDrillNotificationAt: v.optional(v.number()), // Phase 14
  }).index("by_coordinates", ["latitude", "longitude"])
    .index("by_admin", ["adminId"]),

  rooms: defineTable({
    buildingId: v.id("buildings"),
    roomNumber: v.string(),
    floorLevel: v.number(),
    floorPlanUrl: v.string(), // Storage URL for the processed vector/raster floor plan
    exitPathData: v.string(),  // Stringified JSON coordinate array mapping nodes to the exit
  }).index("by_building_room", ["buildingId", "roomNumber"]),

  sites: defineTable({
    name: v.string(),
    adminId: v.string(),
    description: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    adminContactName: v.optional(v.string()),
    emergencyServicesPhone: v.optional(v.string()),
    masterPlanId: v.optional(v.id("_storage")),
    nextDrillAt: v.optional(v.number()), // Phase 13
    drillJobId: v.optional(v.id("_scheduled_functions")), // Phase 13
    lastDrillNotificationAt: v.optional(v.number()), // Phase 14
  }).index("by_name", ["name"]).index("by_admin", ["adminId"]),

  incidents: defineTable({
    buildingId: v.id("buildings"),
    isActive: v.boolean(),
    isDrill: v.optional(v.boolean()), // Phase 13: differentiates between a drill and a real emergency
    triggeredAt: v.number(),
    resolvedAt: v.optional(v.number()),
    endTime: v.optional(v.number()), // Phase 13: exact timestamp when everyone was SAFE
  }).index("by_building", ["buildingId"]),

  // Phase 13: Live Roll Call & Tracking
  rollCall: defineTable({
    incidentId: v.id("incidents"),
    userId: v.id("users"),
    status: v.string(), // "IN_BUILDING", "SAFE", "PANIC"
    lastLat: v.optional(v.number()),
    lastLon: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_incident", ["incidentId"])
    .index("by_incident_user", ["incidentId", "userId"]),

  // Phase 14: Push Notifications & Broadcasts
  announcements: defineTable({
    title: v.string(),
    message: v.string(),
    targetSite: v.optional(v.string()), // Null = all sites/global
    targetBuildingId: v.optional(v.id("buildings")),
    createdAt: v.number(),
  }).index("by_site", ["targetSite"]).index("by_building", ["targetBuildingId"]),
});
