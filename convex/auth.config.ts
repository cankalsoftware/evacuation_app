export default {
  providers: [
    {
      // Replace this with your Clerk Issuer URL from the JWT template
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
