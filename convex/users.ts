import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const syncUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.optional(v.string()),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Determine the verified role from Clerk, defaulting to "guest"
    const verifiedRole = args.role === "admin" ? "admin" : "guest";

    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existingUser) {
      // Update email or role if they changed
      if (
        (args.email && existingUser.email !== args.email) ||
        (existingUser.role !== verifiedRole)
      ) {
        await ctx.db.patch(existingUser._id, { 
          ...(args.email ? { email: args.email } : {}),
          role: verifiedRole,
        });
      }
      return existingUser._id;
    }

    // Create new user
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
