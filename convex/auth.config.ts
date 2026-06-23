/**
 * @file auth.config.ts
 * @description Configuration file binding the Clerk Authentication provider to this Convex backend.
 * Ensures all Convex queries and mutations are securely authenticated against Clerk's JWT tokens.
 * 
 * @module ConvexAuthConfig
 */
export default {
  providers: [
    {
      domain: "https://stirring-mule-87.clerk.accounts.dev/",
      applicationID: "convex",
    },
    {
      domain: "https://stirring-mule-87.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
};
