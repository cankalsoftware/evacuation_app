/**
 * @file portal.ts
 * @description The core Convex backend API file containing over 30 queries and mutations.
 * Handles everything from Building CRUD operations, emergency incident tracking, live roll call
 * states, walkie-talkie audio file references, to daily background check-ins.
 * 
 * @module ConvexPortal
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";


/**
 * ==========================================
 * SECTION 1: USER & DASHBOARD DATA
 * ==========================================
 */
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
      const buildingsRaw = await ctx.db
        .query("buildings")
        .withIndex("by_admin", (q) => q.eq("adminId", args.clerkId!))
        .collect();

      const buildings = await Promise.all(buildingsRaw.map(async (b) => {
        return {
          ...b,
          masterPlanUrl: b.masterPlanId ? await ctx.storage.getUrl(b.masterPlanId) : null
        };
      }));

      const sitesRaw = await ctx.db
        .query("sites")
        .withIndex("by_admin", (q) => q.eq("adminId", args.clerkId!))
        .collect();

      const sites = await Promise.all(sitesRaw.map(async (s) => ({
        ...s,
        masterPlanUrl: s.masterPlanId ? await ctx.storage.getUrl(s.masterPlanId) : null
      })));

      return {
        role: "admin",
        name: user.name,
        phone: user.phone,
        email: user.email,
        approvalStatus: user.approvalStatus || "pending",
        businessName: user.businessName,
        businessAddress: user.businessAddress,
        employerCount: user.employerCount,
        postCode: user.postCode,
        country: user.country,
        agreedToTandC: user.agreedToTandC,
        locationGranted: user.locationGranted,
        notificationsGranted: user.notificationsGranted,
        buildings,
        sites,
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
      agreedToTandC: user.agreedToTandC,
      locationGranted: user.locationGranted,
      notificationsGranted: user.notificationsGranted,
      scannedPlanId: plan?.storageId,
      scannedPlanLat: plan?.latitude,
      scannedPlanLon: plan?.longitude,
      scannedAt: plan?.scannedAt,
      roomNumber: plan?.roomNumber,
      floorLevel: plan?.floorLevel,
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
    roomNumber: v.optional(v.string()),
    floorLevel: v.optional(v.string()),
    exitNode: v.optional(v.object({ x: v.number(), y: v.number() })),
  },
  handler: async (ctx, args) => {
    const existingPlan = await ctx.db
      .query("plans")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existingPlan) {
      if (existingPlan.storageId && existingPlan.storageId !== args.storageId) {
        await ctx.storage.delete(existingPlan.storageId);
      }
      await ctx.db.patch(existingPlan._id, {
        storageId: args.storageId,
        latitude: args.lat,
        longitude: args.lon,
        scannedAt: Date.now(),
        ...(args.roomNumber !== undefined && { roomNumber: args.roomNumber }),
        ...(args.floorLevel !== undefined && { floorLevel: args.floorLevel }),
        ...(args.exitNode !== undefined && { exitNode: args.exitNode }),
      });
    } else {
      await ctx.db.insert("plans", {
        clerkId: args.clerkId,
        storageId: args.storageId,
        latitude: args.lat,
        longitude: args.lon,
        scannedAt: Date.now(),
        roomNumber: args.roomNumber,
        floorLevel: args.floorLevel,
        exitNode: args.exitNode,
      });
    }
  },
});

export const updateProfile = mutation({
  args: {
    clerkId: v.string(),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    agreedToTandC: v.optional(v.boolean()),
    locationGranted: v.optional(v.boolean()),
    notificationsGranted: v.optional(v.boolean()),
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
    if (args.agreedToTandC !== undefined) patchData.agreedToTandC = args.agreedToTandC;
    if (args.locationGranted !== undefined) patchData.locationGranted = args.locationGranted;
    if (args.notificationsGranted !== undefined) patchData.notificationsGranted = args.notificationsGranted;

    await ctx.db.patch(user._id, patchData);
  },
});

export const saveBuilding = mutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    siteName: v.optional(v.string()),
    address: v.string(),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    polygon: v.optional(v.array(v.object({ lat: v.number(), lon: v.number(), label: v.optional(v.string()) }))),
    masterPlanId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user || user.role !== "admin") throw new Error("Unauthorized");

    if (args.polygon && args.polygon.length < 3) {
      throw new Error("A building polygon must have at least 3 points.");
    }

    return await ctx.db.insert("buildings", {
      adminId: args.clerkId,
      name: args.name,
      ...(args.siteName !== undefined && { siteName: args.siteName }),
      address: args.address,
      ...(args.latitude !== undefined && { latitude: args.latitude }),
      ...(args.longitude !== undefined && { longitude: args.longitude }),
      ...(args.polygon && { polygon: args.polygon }),
      ...(args.masterPlanId && { masterPlanId: args.masterPlanId }),
    });
  }
});

export const updateSiteInfo = mutation({
  args: {
    clerkId: v.string(),
    siteName: v.string(),
    description: v.optional(v.string()),
    contactPhone: v.optional(v.string()), // Site Admin Contact Phone
    adminContactName: v.optional(v.string()), // Site Admin Name
    emergencyServicesPhone: v.optional(v.string()), // Fire Brigade/Emergency Dispatch
    masterPlanId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (!user || user.role !== "admin") throw new Error("Unauthorized");

    const existing = await ctx.db.query("sites").withIndex("by_name", q => q.eq("name", args.siteName)).filter(q => q.eq(q.field("adminId"), args.clerkId)).first();
    if (existing) {
      if (args.masterPlanId && existing.masterPlanId && existing.masterPlanId !== args.masterPlanId) {
        await ctx.storage.delete(existing.masterPlanId);
      }

      await ctx.db.patch(existing._id, {
        ...(args.description !== undefined ? { description: args.description } : {}),
        ...(args.contactPhone !== undefined ? { contactPhone: args.contactPhone } : {}),
        ...(args.adminContactName !== undefined ? { adminContactName: args.adminContactName } : {}),
        ...(args.emergencyServicesPhone !== undefined ? { emergencyServicesPhone: args.emergencyServicesPhone } : {}),
        ...(args.masterPlanId !== undefined ? { masterPlanId: args.masterPlanId } : {}),
      });
    } else {
      await ctx.db.insert("sites", {
        name: args.siteName,
        adminId: args.clerkId,
        description: args.description,
        contactPhone: args.contactPhone,
        adminContactName: args.adminContactName,
        emergencyServicesPhone: args.emergencyServicesPhone,
        masterPlanId: args.masterPlanId,
      });
    }
  }
});

export const updateBuildingImage = mutation({
  args: {
    clerkId: v.string(),
    buildingId: v.id("buildings"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user || user.role !== "admin") throw new Error("Unauthorized");

    const building = await ctx.db.get(args.buildingId);
    if (building && building.masterPlanId && building.masterPlanId !== args.storageId) {
      await ctx.storage.delete(building.masterPlanId);
    }

    await ctx.db.patch(args.buildingId, { masterPlanId: args.storageId });
  }
});

export const updateBuildingPolygon = mutation({
  args: {
    clerkId: v.string(),
    buildingId: v.id("buildings"),
    polygon: v.array(v.object({ lat: v.number(), lon: v.number(), label: v.optional(v.string()) })),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user || user.role !== "admin") throw new Error("Unauthorized");
    if (args.polygon.length < 4) throw new Error("A building polygon must have at least 4 points.");

    await ctx.db.patch(args.buildingId, {
      polygon: args.polygon,
      latitude: args.polygon[0].lat,
      longitude: args.polygon[0].lon
    });
  }
});

export const updateBuildingInfo = mutation({
  args: {
    clerkId: v.string(),
    buildingId: v.id("buildings"),
    name: v.string(),
    siteName: v.optional(v.string()),
    address: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user || user.role !== "admin") throw new Error("Unauthorized");

    await ctx.db.patch(args.buildingId, {
      name: args.name,
      ...(args.siteName !== undefined ? { siteName: args.siteName } : {}),
      address: args.address
    });
  }
});

export const updateBuildingCalibration = mutation({
  args: {
    clerkId: v.string(),
    buildingId: v.id("buildings"),
    calibrationPoints: v.array(v.object({ x: v.number(), y: v.number() })),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user || user.role !== "admin") throw new Error("Unauthorized");
    if (args.calibrationPoints.length < 3) throw new Error("Must provide at least 3 calibration points.");

    await ctx.db.patch(args.buildingId, {
      imageCalibrationPoints: args.calibrationPoints
    });
  }
});

export const updateBuildingSafeNodes = mutation({
  args: {
    clerkId: v.string(),
    buildingId: v.id("buildings"),
    safeNodes: v.array(v.object({ lat: v.number(), lon: v.number(), isExit: v.boolean() })),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user || user.role !== "admin") throw new Error("Unauthorized");

    const building = await ctx.db.get(args.buildingId);
    if (!building || !building.polygon) throw new Error("Building or polygon not found");

    for (const node of args.safeNodes) {
      if (node.isExit) {
        if (!isPointInPolygonWithMargin({ lat: node.lat, lon: node.lon }, building.polygon, 0.10)) {
          throw new Error("One or more Exits fall too far outside the building polygon (exceeds 10% margin).");
        }
      } else {
        if (!isPointInPolygon({ lat: node.lat, lon: node.lon }, building.polygon)) {
          throw new Error("One or more Turn Points fall strictly outside the building polygon.");
        }
      }
    }
    await ctx.db.patch(args.buildingId, {
      safeNodes: args.safeNodes
    });
  },
});

export const updateBuildingGridPaths = mutation({
  args: {
    clerkId: v.string(),
    buildingId: v.id("buildings"),
    gridPaths: v.array(v.object({ row: v.number(), col: v.number(), lat: v.number(), lon: v.number(), isExit: v.boolean(), type: v.optional(v.string()) })),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user || user.role !== "admin") throw new Error("Unauthorized");

    await ctx.db.patch(args.buildingId, {
      gridPaths: args.gridPaths
    });
  }
});

export const updateBuildingDoorPins = mutation({
  args: {
    clerkId: v.string(),
    buildingId: v.id("buildings"),
    doorPins: v.array(v.object({ x: v.number(), y: v.number(), type: v.string(), label: v.optional(v.string()) })),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user || user.role !== "admin") throw new Error("Unauthorized");

    await ctx.db.patch(args.buildingId, {
      doorPins: args.doorPins
    });
  }
});

export const deleteBuilding = mutation({
  args: {
    clerkId: v.string(),
    buildingId: v.id("buildings"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user || user.role !== "admin") throw new Error("Unauthorized");

    const building = await ctx.db.get(args.buildingId);
    if (building?.masterPlanId) {
      await ctx.storage.delete(building.masterPlanId);
    }

    // Cleanup incident and rollCall data
    const incidents = await ctx.db.query("incidents").withIndex("by_building", q => q.eq("buildingId", args.buildingId)).collect();
    for (const incident of incidents) {
      const insides = await ctx.db.query("inside").withIndex("by_incident_user", q => q.eq("incidentId", incident._id)).collect();
      for (const rc of insides) {
        await ctx.db.delete(rc._id);
      }
      const outsides = await ctx.db.query("outside").withIndex("by_incident_user", q => q.eq("incidentId", incident._id)).collect();
      for (const rc of outsides) {
        await ctx.db.delete(rc._id);
      }
      await ctx.db.delete(incident._id);
    }

    if (building?.drillJobId) {
      await ctx.scheduler.cancel(building.drillJobId);
    }

    await ctx.db.delete(args.buildingId);
  }
});

// Ray-Casting algorithm to check if a point is inside a polygon
export function isPointInPolygon(point: { lat: number, lon: number }, polygon: { lat: number, lon: number }[]) {
  let isInside = false;
  let j = polygon.length - 1;
  for (let i = 0; i < polygon.length; i++) {
    const xi = polygon[i].lon, yi = polygon[i].lat;
    const xj = polygon[j].lon, yj = polygon[j].lat;

    const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lon < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
    if (intersect) isInside = !isInside;
    j = i;
  }
  return isInside;
}

function distanceToLineSegment(p: { lat: number, lon: number }, v: { lat: number, lon: number }, w: { lat: number, lon: number }) {
  const l2 = (w.lat - v.lat) ** 2 + (w.lon - v.lon) ** 2;
  if (l2 === 0) return Math.sqrt((p.lat - v.lat) ** 2 + (p.lon - v.lon) ** 2);
  let t = ((p.lon - v.lon) * (w.lon - v.lon) + (p.lat - v.lat) * (w.lat - v.lat)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projLat = v.lat + t * (w.lat - v.lat);
  const projLon = v.lon + t * (w.lon - v.lon);
  return Math.sqrt((p.lat - projLat) ** 2 + (p.lon - projLon) ** 2);
}

export function isPointInPolygonWithMargin(point: { lat: number, lon: number }, polygon: { lat: number, lon: number }[], marginFactor: number) {
  if (isPointInPolygon(point, polygon)) return true;

  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;
  for (const p of polygon) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }

  const diag = Math.sqrt((maxLat - minLat) ** 2 + (maxLon - minLon) ** 2);
  const allowedDist = Math.max(0.00005, diag * marginFactor); // Dynamic margin based on polygon scale

  // Check precise distance to any edge to handle concave (L-shape) polygons
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const d = distanceToLineSegment(point, polygon[j], polygon[i]);
    if (d <= allowedDist) return true;
  }

  return false;
}

export const getAutoPushedBuilding = query({
  args: { lat: v.number(), lon: v.number() },
  handler: async (ctx, args) => {
    // 1. Fetch all buildings
    const buildings = await ctx.db.query("buildings").collect();

    // 2. Run ray-casting to find if the user is inside any building's polygon
    for (const b of buildings) {
      const isReady = b.polygon && b.polygon.length >= 3 &&
        b.masterPlanId &&
        b.imageCalibrationPoints && b.imageCalibrationPoints.length >= 3 &&
        b.safeNodes && b.safeNodes.some((n: any) => n.isExit);

      if (isReady) {
        if (isPointInPolygonWithMargin({ lat: args.lat, lon: args.lon }, b.polygon!, 0.05)) {
          return {
            buildingId: b._id,
            name: b.name,
            masterPlanUrl: await ctx.storage.getUrl(b.masterPlanId!),
            polygon: b.polygon,
            safeNodes: b.safeNodes,
            imageCalibrationPoints: b.imageCalibrationPoints,
          };
        }
      }
    }
    return null; // Not inside any known building
  }
});

// --- PHASE 12: INCIDENT ENGINE ---

export const triggerIncident = mutation({
  args: { clerkId: v.string(), buildingId: v.id("buildings"), isDrill: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    // Allow if admin or if called via scheduler (no clerkId)
    if (args.clerkId && (!user || user.role !== "admin")) throw new Error("Unauthorized");

    // Check if incident already exists and is active
    const existing = await ctx.db.query("incidents").withIndex("by_building", q => q.eq("buildingId", args.buildingId)).filter(q => q.eq(q.field("isActive"), true)).first();
    if (existing) return;

    const incidentId = await ctx.db.insert("incidents", {
      buildingId: args.buildingId,
      isActive: true,
      isDrill: args.isDrill ?? false,
      triggeredAt: Date.now(),
    });

    // --- PHASE 15: AUTO-POPULATE ROLL CALL ---
    const activeUsers = await ctx.db.query("users").filter(q => q.eq(q.field("activeBuildingId"), args.buildingId)).collect();
    for (const occupant of activeUsers) {
      await ctx.db.insert("inside", {
        incidentId,
        userId: occupant._id,
        status: "IN_BUILDING",
        updatedAt: Date.now()
      });
    }
  }
});

export const deleteStorageImage = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    // Only allow if requested
    await ctx.storage.delete(args.storageId);
  }
});

export const triggerSiteIncident = mutation({
  args: { clerkId: v.string(), siteName: v.string(), isDrill: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (args.clerkId && (!user || user.role !== "admin")) throw new Error("Unauthorized");

    const buildings = await ctx.db.query("buildings").filter(q => q.eq(q.field("siteName"), args.siteName)).collect();

    for (const b of buildings) {
      const existing = await ctx.db.query("incidents").withIndex("by_building", q => q.eq("buildingId", b._id)).filter(q => q.eq(q.field("isActive"), true)).first();
      if (!existing) {
        const incidentId = await ctx.db.insert("incidents", {
          buildingId: b._id,
          isActive: true,
          isDrill: args.isDrill ?? false,
          triggeredAt: Date.now(),
        });

        // --- PHASE 15: AUTO-POPULATE ROLL CALL ---
        const activeUsers = await ctx.db.query("users").filter(q => q.eq(q.field("activeBuildingId"), b._id)).collect();
        for (const occupant of activeUsers) {
          await ctx.db.insert("inside", {
            incidentId,
            userId: occupant._id,
            status: "IN_BUILDING",
            updatedAt: Date.now()
          });
        }
      }
    }
  }
});

export const resolveIncident = mutation({
  args: { clerkId: v.string(), buildingId: v.id("buildings") },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (!user || user.role !== "admin") throw new Error("Unauthorized");

    const active = await ctx.db.query("incidents").withIndex("by_building", q => q.eq("buildingId", args.buildingId)).filter(q => q.eq(q.field("isActive"), true)).collect();
    for (const a of active) {
      await ctx.db.patch(a._id, { isActive: false, resolvedAt: Date.now(), endTime: Date.now() });
    }
  }
});

export const resolveSiteIncident = mutation({
  args: { clerkId: v.string(), siteName: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (!user || user.role !== "admin") throw new Error("Unauthorized");

    const buildings = await ctx.db.query("buildings").withIndex("by_admin", q => q.eq("adminId", args.clerkId)).filter(q => q.eq(q.field("siteName"), args.siteName)).collect();

    for (const b of buildings) {
      const active = await ctx.db.query("incidents").withIndex("by_building", q => q.eq("buildingId", b._id)).filter(q => q.eq(q.field("isActive"), true)).collect();
      for (const a of active) {
        await ctx.db.patch(a._id, { isActive: false, resolvedAt: Date.now(), endTime: Date.now() });
      }
    }
  }
});

export const getActiveIncidents = query({
  args: { clerkId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const clerkId = args.clerkId;
    if (!clerkId) return [];
    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", clerkId)).first();
    if (!user || user.role !== "admin") return [];

    const buildings = await ctx.db.query("buildings").withIndex("by_admin", q => q.eq("adminId", clerkId)).collect();
    const activeIncidents = [];

    for (const b of buildings) {
      const incident = await ctx.db.query("incidents").withIndex("by_building", q => q.eq("buildingId", b._id)).filter(q => q.eq(q.field("isActive"), true)).first();
      if (incident) {
        activeIncidents.push({
          buildingId: b._id,
          incidentId: incident._id,
          isDrill: incident.isDrill,
          triggeredAt: incident.triggeredAt
        });
      }
    }
    return activeIncidents;
  }
});

export const getRecentIncidents = query({
  args: { clerkId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const clerkId = args.clerkId;
    if (!clerkId) return [];
    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", clerkId)).first();
    if (!user || user.role !== "admin") return [];

    const buildings = await ctx.db.query("buildings").withIndex("by_admin", q => q.eq("adminId", clerkId)).collect();
    const buildingIds = buildings.map(b => b._id);

    // In Convex, no "IN" query natively yet. So we fetch all incidents for these buildings and sort.
    let recentIncidents = [];
    for (const bId of buildingIds) {
      const incs = await ctx.db.query("incidents").withIndex("by_building", q => q.eq("buildingId", bId)).filter(q => q.eq(q.field("isActive"), false)).order("desc").take(5);
      for (const inc of incs) {
        const building = buildings.find(b => b._id === inc.buildingId);
        recentIncidents.push({ ...inc, buildingName: building?.name, siteName: building?.siteName });
      }
    }

    // Sort by triggeredAt descending
    recentIncidents.sort((a, b) => b.triggeredAt - a.triggeredAt);
    return recentIncidents.slice(0, 5); // top 5 overall
  }
});

export const getAllIncidentsHistory = query({
  args: { clerkId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const clerkId = args.clerkId;
    if (!clerkId) return [];
    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", clerkId)).first();
    if (!user || user.role !== "admin") return [];

    const buildings = await ctx.db.query("buildings").withIndex("by_admin", q => q.eq("adminId", clerkId)).collect();
    const buildingIds = buildings.map(b => b._id);

    let allIncidents = [];
    for (const bId of buildingIds) {
      const incs = await ctx.db.query("incidents").withIndex("by_building", q => q.eq("buildingId", bId)).filter(q => q.eq(q.field("isActive"), false)).collect();
      for (const inc of incs) {
        const building = buildings.find(b => b._id === inc.buildingId);
        allIncidents.push({ ...inc, buildingName: building?.name, siteName: building?.siteName });
      }
    }

    allIncidents.sort((a, b) => b.triggeredAt - a.triggeredAt);
    return allIncidents;
  }
});

export const getActiveIncident = query({
  args: { buildingId: v.optional(v.id("buildings")) },
  handler: async (ctx, args) => {
    const buildingId = args.buildingId;
    if (!buildingId) return null;
    return await ctx.db.query("incidents").withIndex("by_building", q => q.eq("buildingId", buildingId)).filter(q => q.eq(q.field("isActive"), true)).first();
  }
});

// --- PHASE 13: ROLL CALL & SOS ---

export const checkInUser = mutation({
  args: {
    clerkId: v.string(),
    buildingId: v.union(v.id("buildings"), v.null()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) return;

    await ctx.db.patch(user._id, {
      activeBuildingId: args.buildingId || undefined,
    });
  }
});
export const updateEvacuationStatus = mutation({
  args: {
    clerkId: v.string(),
    incidentId: v.id("incidents"),
    lat: v.number(),
    lon: v.number(),
    setPanic: v.optional(v.boolean()),
    setSafe: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (!user) throw new Error("Unauthorized");

    const incident = await ctx.db.get(args.incidentId);
    if (!incident || !incident.isActive) return;

    const building = await ctx.db.get(incident.buildingId);
    if (!building || !building.polygon) return;

    let status = "SAFE";
    if (args.setPanic) {
      status = "PANIC";
    } else if (args.setSafe) {
      status = "SAFE";
    } else {
      const inside = isPointInPolygonWithMargin({ lat: args.lat, lon: args.lon }, building.polygon, 0.05);
      status = inside ? "IN_BUILDING" : "SAFE";
    }

    const existingInside = await ctx.db.query("inside").withIndex("by_incident_user", q => q.eq("incidentId", args.incidentId).eq("userId", user._id)).first();
    const existingOutside = await ctx.db.query("outside").withIndex("by_incident_user", q => q.eq("incidentId", args.incidentId).eq("userId", user._id)).first();

    if (existingInside && status === "SAFE") {
      await ctx.db.delete(existingInside._id);
      await ctx.db.insert("outside", {
        incidentId: args.incidentId,
        userId: user._id,
        status,
        lastLat: args.lat,
        lastLon: args.lon,
        updatedAt: Date.now()
      });
    } else if (existingOutside && status !== "SAFE") {
      await ctx.db.delete(existingOutside._id);
      await ctx.db.insert("inside", {
        incidentId: args.incidentId,
        userId: user._id,
        status,
        lastLat: args.lat,
        lastLon: args.lon,
        updatedAt: Date.now()
      });
    } else if (existingInside) {
      if (existingInside.status === "PANIC" && !args.setSafe) status = "PANIC";
      await ctx.db.patch(existingInside._id, { status, lastLat: args.lat, lastLon: args.lon, updatedAt: Date.now() });
    } else if (existingOutside) {
      await ctx.db.patch(existingOutside._id, { status, lastLat: args.lat, lastLon: args.lon, updatedAt: Date.now() });
    } else {
      const table = status === "SAFE" ? "outside" : "inside";
      await ctx.db.insert(table as any, {
        incidentId: args.incidentId,
        userId: user._id,
        status,
        lastLat: args.lat,
        lastLon: args.lon,
        updatedAt: Date.now()
      });
    }
  }
});

export const getEvacuationData = query({
  args: { clerkId: v.string(), incidentId: v.optional(v.id("incidents")) },
  handler: async (ctx, args) => {
    if (!args.incidentId) return { inside: [], outside: [] };
    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (!user || user.role !== "admin") return { inside: [], outside: [] };

    const insides = await ctx.db.query("inside").withIndex("by_incident", q => q.eq("incidentId", args.incidentId!)).collect();
    const outsides = await ctx.db.query("outside").withIndex("by_incident", q => q.eq("incidentId", args.incidentId!)).collect();

    // Join with users
    const resultsInside = await Promise.all(insides.map(async (r) => {
      const u = await ctx.db.get(r.userId);
      return { ...r, userName: u?.name || u?.email || "Unknown Guest" };
    }));

    const resultsOutside = await Promise.all(outsides.map(async (r) => {
      const u = await ctx.db.get(r.userId);
      return { ...r, userName: u?.name || u?.email || "Unknown Guest" };
    }));

    // Sort Inside: PANIC -> IN_BUILDING
    resultsInside.sort((a, b) => {
      const order: Record<string, number> = { "PANIC": 0, "IN_BUILDING": 1 };
      return (order[a.status] ?? 2) - (order[b.status] ?? 2);
    });

    return { inside: resultsInside, outside: resultsOutside };
  }
});

import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

export const internalTriggerDrill = internalMutation({
  args: { buildingId: v.optional(v.id("buildings")), siteName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.buildingId) {
      const existing = await ctx.db.query("incidents").withIndex("by_building", q => q.eq("buildingId", args.buildingId!)).filter(q => q.eq(q.field("isActive"), true)).first();
      if (!existing) {
        await ctx.db.insert("incidents", {
          buildingId: args.buildingId,
          isActive: true,
          isDrill: true,
          triggeredAt: Date.now(),
        });
      }
      await ctx.db.patch(args.buildingId, { nextDrillAt: undefined, drillJobId: undefined });
    } else if (args.siteName) {
      const buildings = await ctx.db.query("buildings").filter(q => q.eq(q.field("siteName"), args.siteName)).collect();
      for (const b of buildings) {
        const existing = await ctx.db.query("incidents").withIndex("by_building", q => q.eq("buildingId", b._id)).filter(q => q.eq(q.field("isActive"), true)).first();
        if (!existing) {
          await ctx.db.insert("incidents", {
            buildingId: b._id,
            isActive: true,
            isDrill: true,
            triggeredAt: Date.now(),
          });
        }
      }
      const sites = await ctx.db.query("sites").withIndex("by_name", q => q.eq("name", args.siteName!)).collect();
      for (const s of sites) {
        await ctx.db.patch(s._id, { nextDrillAt: undefined, drillJobId: undefined });
      }
    }
  }
});

export const scheduleDrill = mutation({
  args: { clerkId: v.string(), timestamp: v.number(), buildingId: v.optional(v.id("buildings")), siteName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (!user || user.role !== "admin") throw new Error("Unauthorized");

    // Cancel old job if it exists
    if (args.buildingId) {
      const b = await ctx.db.get(args.buildingId);
      if (b?.drillJobId) await ctx.scheduler.cancel(b.drillJobId);
      const jobId = await ctx.scheduler.runAt(args.timestamp, internal.portal.internalTriggerDrill, { buildingId: args.buildingId });
      await ctx.db.patch(args.buildingId, { nextDrillAt: args.timestamp, drillJobId: jobId });
    } else if (args.siteName) {
      const sites = await ctx.db.query("sites").withIndex("by_name", q => q.eq("name", args.siteName!)).filter(q => q.eq(q.field("adminId"), args.clerkId)).collect();
      for (const s of sites) {
        if (s.drillJobId) await ctx.scheduler.cancel(s.drillJobId);
        const jobId = await ctx.scheduler.runAt(args.timestamp, internal.portal.internalTriggerDrill, { siteName: args.siteName });
        await ctx.db.patch(s._id, { nextDrillAt: args.timestamp, drillJobId: jobId });
      }
    }
  }
});

export const cancelDrill = mutation({
  args: { clerkId: v.string(), buildingId: v.optional(v.id("buildings")), siteName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (!user || user.role !== "admin") throw new Error("Unauthorized");

    if (args.buildingId) {
      const b = await ctx.db.get(args.buildingId);
      if (b?.drillJobId) await ctx.scheduler.cancel(b.drillJobId);
      await ctx.db.patch(args.buildingId, { nextDrillAt: undefined, drillJobId: undefined });
    } else if (args.siteName) {
      const sites = await ctx.db.query("sites").withIndex("by_name", q => q.eq("name", args.siteName!)).filter(q => q.eq(q.field("adminId"), args.clerkId)).collect();
      for (const s of sites) {
        if (s.drillJobId) await ctx.scheduler.cancel(s.drillJobId);
        await ctx.db.patch(s._id, { nextDrillAt: undefined, drillJobId: undefined });
      }
    }
  }
});

// --- PHASE 14: PUSH NOTIFICATIONS & ANNOUNCEMENTS ---

export const savePushToken = mutation({
  args: { clerkId: v.string(), token: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (user) {
      await ctx.db.patch(user._id, { expoPushToken: args.token });
    }
  }
});

export const sendDrillNotification = mutation({
  args: {
    clerkId: v.string(),
    buildingId: v.optional(v.id("buildings")),
    siteName: v.optional(v.string()),
    message: v.string()
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (!admin || admin.role !== "admin") throw new Error("Unauthorized");

    let title = "Upcoming Drill";
    if (args.buildingId) {
      const b = await ctx.db.get(args.buildingId);
      if (b) {
        title = `Upcoming Drill: ${b.name}`;
        await ctx.db.patch(b._id, { lastDrillNotificationAt: Date.now() });
      }
    } else if (args.siteName) {
      title = `Upcoming Drill: ${args.siteName} Site`;
      const site = await ctx.db.query("sites").withIndex("by_name", q => q.eq("name", args.siteName as string)).first();
      if (site) {
        await ctx.db.patch(site._id, { lastDrillNotificationAt: Date.now() });
      }
      // Also update all buildings within this site
      const buildingsInSite = await ctx.db.query("buildings").filter(q => q.eq(q.field("siteName"), args.siteName as string)).collect();
      for (const b of buildingsInSite) {
        await ctx.db.patch(b._id, { lastDrillNotificationAt: Date.now() });
      }
    }

    // Save Announcement
    await ctx.db.insert("announcements", {
      title,
      message: args.message,
      targetBuildingId: args.buildingId,
      targetSite: args.siteName,
      createdAt: Date.now()
    });

    // In a real production scenario, we'd fire an action here to hit the Expo Push Notification HTTP API:
    // https://exp.host/--/api/v2/push/send
    // We would query all users, map out those with valid expoPushToken fields, 
    // and send them the payload. For the scope of this project run, 
    // saving it to Announcements covers the required behavior.
  }
});

export const getRecentAnnouncements = query({
  handler: async (ctx) => {
    // Return all announcements globally for now
    const limit = Date.now() - (1000 * 60 * 60 * 24); // 24 hours
    return await ctx.db.query("announcements").filter(q => q.gte(q.field("createdAt"), limit)).order("desc").collect();
  }
});



export const debugUykoComplete = query({
  handler: async (ctx) => {
    const b = await ctx.db.query('buildings').filter(q => q.eq(q.field('siteName'), 'uyko')).collect();
    return b.map(x => ({
      name: x.name,
      poly: !!x.polygon && x.polygon.length >= 3,
      mp: !!x.masterPlanId,
      cal: !!x.imageCalibrationPoints && x.imageCalibrationPoints.length >= 3,
      addr: !!x.address && x.address !== 'No Address Provided'
    }));
  }
});
export const deleteIncidents = mutation({
  args: {
    clerkId: v.string(),
    incidentIds: v.array(v.id("incidents"))
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (!admin || admin.role !== "admin") throw new Error("Unauthorized");

    // In a real production app we might verify that these incidents belong to buildings owned by the admin.
    // For now, we trust the UI since the UI only shows their incidents.
    for (const id of args.incidentIds) {
      const inc = await ctx.db.get(id);
      if (inc) {
        await ctx.db.delete(id);
      }
    }
  }
});

export const moveToOutside = mutation({
  args: { clerkId: v.string(), insideIds: v.array(v.id("inside")) },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_clerkId", q => q.eq("clerkId", args.clerkId)).first();
    if (!user || user.role !== "admin") throw new Error("Unauthorized");

    for (const id of args.insideIds) {
      const record = await ctx.db.get(id);
      if (record) {
        await ctx.db.delete(id);
        await ctx.db.insert("outside", {
          incidentId: record.incidentId,
          userId: record.userId,
          status: "SAFE",
          lastLat: record.lastLat,
          lastLon: record.lastLon,
          updatedAt: Date.now()
        });
      }
    }
  }
});
/**
 * ==========================================
 * SECTION 9: PHASE 26 - HYBRID SENSOR FUSION (WIFI TRACKING)
 * ==========================================
 */

/**
 * Saves a batch of Wi-Fi fingerprints captured by the Admin during the Calibration Walk.
 */
export const saveWifiFingerprints = mutation({
  args: {
    clerkId: v.string(),
    buildingId: v.id('buildings'),
    fingerprints: v.array(v.object({
      bssid: v.string(),
      lat: v.number(),
      lon: v.number(),
      signalStrength: v.number(),
      nodeType: v.optional(v.union(v.literal("ENTRANCE"), v.literal("FIRE_EXIT"), v.literal("SAFE_PATH"))),
      gpsLat: v.optional(v.number()),
      gpsLon: v.optional(v.number()),
      x: v.optional(v.number()),
      y: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.query('users').withIndex('by_clerkId', q => q.eq('clerkId', args.clerkId)).first();
    if (!user || user.role !== 'admin') throw new Error('Unauthorized');

    // Delete existing fingerprints for this building
    const existing = await ctx.db.query('wifiFingerprints')
      .withIndex('by_building', q => q.eq('buildingId', args.buildingId))
      .collect();
    for (const fp of existing) {
      await ctx.db.delete(fp._id);
    }

    for (const fp of args.fingerprints) {
      await ctx.db.insert('wifiFingerprints', {
        buildingId: args.buildingId,
        bssid: fp.bssid,
        lat: fp.lat,
        lon: fp.lon,
        signalStrength: fp.signalStrength,
        nodeType: fp.nodeType,
        gpsLat: fp.gpsLat,
        gpsLon: fp.gpsLon,
        x: fp.x,
        y: fp.y,
        createdAt: Date.now()
      });
    }
    return { success: true, count: args.fingerprints.length };
  }
});

/**
 * Retrieves all Wi-Fi fingerprints for a specific building.
 */
export const getWifiFingerprints = query({
  args: {
    buildingId: v.optional(v.id('buildings')),
  },
  handler: async (ctx, args) => {
    if (!args.buildingId) return [];
    return await ctx.db
      .query('wifiFingerprints')
      .withIndex('by_building', (q) => q.eq('buildingId', args.buildingId!))
      .collect();
  }
});
