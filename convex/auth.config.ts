export default {
  providers: [
    {
      // Trailing slash is REQUIRED by Clerk's OIDC implementation
      domain: "https://stirring-mule-87.clerk.accounts.dev/",
      applicationID: "convex",
    },
  ],
};
