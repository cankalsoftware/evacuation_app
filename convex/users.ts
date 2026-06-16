import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const syncUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.optional(v.string()),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existingUser) {
      // If args.role is explicitly "admin", upgrade them. Otherwise, keep their existing role.
      // This prevents a user from being downgraded to "guest" on subsequent logins.
      const newRole = args.role === "admin" ? "admin" : existingUser.role;

      // Update email or role if they changed
      if (
        (args.email && existingUser.email !== args.email) ||
        (existingUser.role !== newRole)
      ) {
        await ctx.db.patch(existingUser._id, { 
          ...(args.email ? { email: args.email } : {}),
          role: newRole,
        });
      }
      return existingUser._id;
    }

    // Create new user (default to guest if not explicitly admin)
    const verifiedRole = args.role === "admin" ? "admin" : "guest";
    const newUserId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      role: verifiedRole,
      createdAt: Date.now(),
    });

    return newUserId;
  },
});

export const getUser = query({
  args: { clerkId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!args.clerkId) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId!))
      .first();
  },
});

export const updateAdminProfile = mutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    phone: v.string(),
    businessName: v.string(),
    businessAddress: v.string(),
    employerCount: v.string(),
    agreedToSubscription: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!existingUser) throw new Error("User not found");

    await ctx.db.patch(existingUser._id, {
      name: args.name,
      phone: args.phone,
      businessName: args.businessName,
      businessAddress: args.businessAddress,
      employerCount: args.employerCount,
      agreedToSubscription: args.agreedToSubscription,
      approvalStatus: existingUser.approvalStatus || "pending",
    });
  },
});

export const savePushToken = mutation({
  args: {
    clerkId: v.string(),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!existingUser) throw new Error("User not found");

    await ctx.db.patch(existingUser._id, {
      expoPushToken: args.token,
    });
  },
});
