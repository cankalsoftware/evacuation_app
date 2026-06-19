# Phase 20 Completed: Admin Registration & Access Control

I have successfully implemented the security measures to lock down the Admin dashboard prior to your Google Play launch.

## What was changed?

1. **Convex Schema & API Upgrades:**
   - Modified `users` table to securely store: `businessName`, `businessAddress`, `employerCount`, `agreedToSubscription`, and `approvalStatus`.
   - Updated `updateAdminProfile` API to accept and store these new fields when an Admin registers. The backend strictly enforces that these are provided.

2. **Expanded Admin Setup Form & Layout:**
   - The form in `AdminDashboard.tsx` is laid out in exact order: Admin Name, Admin Email, Admin Telephone, Business Name, Business Address, Employer Count.
   - **Admin Email is now Read-Only:** It pulls the exact email verified by Clerk during sign-up to prevent users from bypassing domain checks with fake business emails.
   - Added dropdown-style buttons for **Employer Count**.
   - Added the Subscription conditions as a **Note** right above a confirmation checkbox.

3. **Domain Matching & Email Validation:**
   - The validation runs against their *actual registered Clerk email*.
   - Built a robust validation check that completely blocks public email domains (`gmail`, `yahoo`, `hotmail`, etc.).
   - Implemented a string similarity check: The system actively strips the `Business Name` and checks if it closely matches the prefix of their registered email domain.
   - Empty fields highlight with a bright red border when clicking Submit.
   - If they fail the domain check, an alert instructs them to email `info@firevision.uk` for manual approval.

4. **The "Pending Approval" Gate:**
   - Instead of instantly accessing the Admin mapping and push notification tools, completing the form flags their account as `pending`.
   - The app actively locks the screen to a `"Pending Approval"` view, featuring the Firevision logo and advising them that Firevision will review and activate their account shortly.

## Verification
- You can test this by registering a new account, selecting the Admin role, and viewing the new form.
- The Admin Email box will be locked with your current login email.
- Try leaving fields empty and pressing submit to test the red highlight UI.
- Try entering a mismatched business name to trigger the domain rejection logic.
