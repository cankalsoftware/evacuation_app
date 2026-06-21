export default {
  providers: [
    {
      // The trailing slash might cause mismatch with the token issuer
      domain: "https://stirring-mule-87.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
};
