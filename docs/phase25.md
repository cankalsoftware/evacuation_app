# Add Header Comments to Convex Backend

The goal is to extend the documentation effort to the backend convex/ directory, adding file-level headers and function-level JSDoc comments to clarify database interactions, background tasks, and AI integrations.

## Proposed Changes

We will modify the following files in the convex/ directory:

### [MODIFY] auth.config.ts
- Add a file header explaining its role in binding Clerk Authentication to the Convex instance.

### [MODIFY] crons.ts
- Add a file header and document the cron jobs (e.g., daily drill schedules).

### [MODIFY] emails.ts
- Document the integration with Resend/SendGrid for dispatching automated onboarding and emergency emails.

### [MODIFY] schema.ts
- Add a file header outlining the data architecture and document the core tables (users, buildings, incidents, evacuations, walkie_talkie_logs).

### [MODIFY] users.ts
- Document the Clerk webhook handlers that automatically provision user records when a user registers.

### [MODIFY] vision.ts
- Document the OpenAI Vision API integration that analyzes uploaded floor plans.

### [MODIFY] portal.ts
- Add a comprehensive top-level file description.
- Add category headers dividing the file into logically grouped operations (e.g., Building Setup, Incident Management, Dashboard Data).
- Document the most complex mutations (e.g., checkInUser, triggerIncident, updateEvacuationStatus).
