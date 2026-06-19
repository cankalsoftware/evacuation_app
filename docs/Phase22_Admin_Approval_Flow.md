# Phase 22: Admin Setup & Automated Approval Flow

## Goal Description
The objective is to refine the Admin onboarding experience and automate the approval email process:
1. Ensure the user must complete the "Admin Setup" form (adding their name, business details, etc.) **before** they see the "FireVision will approve your account" message.
2. Once the setup is completed, convex will trigger an email notification to `info@firevision.uk` alerting them that a new admin account is pending approval.
3. Establish a Convex Cron Job that automatically detects when an admin's account `approvalStatus` is changed to `approved` manually by staff in the Convex Dashboard. When this change is detected, it will automatically send an activation email to the Admin's registered email address.

## Open Questions

> [!IMPORTANT]
> To send emails securely from our Convex backend without storing `.env` files locally, you will need to add the SMTP credentials directly in your **Convex Dashboard Settings -> Environment Variables**. The variables will be: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS`.

> [!NOTE]
> Since FireVision staff will likely be manually changing the `approvalStatus` to `"approved"` inside the Convex Data Dashboard, we will implement a background Cron Job running every 5 minutes. This job will look for any user who is `approved` but has not yet received their activation email, and automatically dispatch the welcome email to them! Does this robust automated approach sound good?

## Proposed Changes

### Components Layer

#### [MODIFY] `components/AdminDashboard.tsx`
- Move the `dashboardData.approvalStatus === "pending"` screen check so that it executes **after** the `needsSetup || showSettings` check. This forces new users to see the setup form instead of the pending screen.
- Inside the "Submit for Approval" button `onPress` handler, add logic to call a new Convex action (`emails:notifyFireVisionNewAdmin`) immediately after the profile successfully saves.

***

### Backend Layer (Convex)

#### [MODIFY] `convex/schema.ts`
- Add an `activationEmailSent: v.optional(v.boolean())` field to the `users` table so we can track if the cron job has sent the welcome email yet.

#### [NEW] `convex/emails.ts` (Node Environment)
- Create an action named `notifyFireVisionNewAdmin` that uses `nodemailer` to alert `info@firevision.uk`.
- Create an action named `sendAdminActivationEmail` that uses `nodemailer` to alert the Admin that their account is now active.

#### [NEW] `convex/crons.ts`
- Create a cron job that runs periodically.
- It will query the database for users where `role === "admin"`, `approvalStatus === "approved"`, and `activationEmailSent !== true`.
- For each matching user, it will call the `sendAdminActivationEmail` action and mark the user as `activationEmailSent: true`.

***

## Verification Plan

### Manual Verification
1. I will ask you to register a brand new Admin account on your Dev Client.
2. You will verify that upon registration, you are immediately taken to the Setup Form instead of the "Pending Approval" screen.
3. You will fill in the setup form and press "Submit for Approval".
4. You will check Convex logs to ensure the internal email dispatch was triggered to `info@firevision.uk`.
5. You will manually change your status to `"approved"` in the Convex dashboard.
6. We will wait for the cron job to run and verify it attempts to send the welcome email to the newly approved admin.
