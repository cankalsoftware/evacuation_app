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

export const saveBuilding = mutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
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
    
    if (args.polygon && args.polygon.length < 4) {
      throw new Error("A building polygon must have at least 4 points.");
    }

    return await ctx.db.insert("buildings", {
      adminId: args.clerkId,
      name: args.name,
      address: args.address,
      ...(args.latitude !== undefined && { latitude: args.latitude }),
      ...(args.longitude !== undefined && { longitude: args.longitude }),
      ...(args.polygon && { polygon: args.polygon }),
      ...(args.masterPlanId && { masterPlanId: args.masterPlanId }),
    });
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
    if (args.calibrationPoints.length < 4) throw new Error("Must provide at least 4 calibration points.");
    
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
    
    // We optionally might want to delete the masterPlanId image from storage, but keeping it simple for now
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
  
  const latMargin = (maxLat - minLat) * marginFactor;
  const lonMargin = (maxLon - minLon) * marginFactor;
  
  return (
    point.lat >= minLat - latMargin && point.lat <= maxLat + latMargin &&
    point.lon >= minLon - lonMargin && point.lon <= maxLon + lonMargin
  );
}

export const getAutoPushedBuilding = query({
  args: { lat: v.number(), lon: v.number() },
  handler: async (ctx, args) => {
    // 1. Fetch all buildings
    const buildings = await ctx.db.query("buildings").collect();
    
    // 2. Run ray-casting to find if the user is inside any building's polygon
    for (const b of buildings) {
       const isReady = b.polygon && b.polygon.length >= 4 && 
                       b.masterPlanId && 
                       b.imageCalibrationPoints && b.imageCalibrationPoints.length === 4 &&
                       b.safeNodes && b.safeNodes.some((n: any) => n.isExit);
                       
       if (isReady) {
          if (isPointInPolygon({ lat: args.lat, lon: args.lon }, b.polygon!)) {
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
