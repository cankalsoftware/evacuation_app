# Phase 20: Admin Registration & Access Control

Before releasing the MVP to the Google Play Store, we must secure the Admin access. Currently, anyone can select "Admin" during signup and gain immediate access to push notifications, live rolls calls, and building setups. This is a critical security risk.

This phase introduces a strict registration and approval gate for all Admin accounts.

## Proposed Features

### 1. Expanded Admin Registration Form
When a user signs up and selects the "Admin" role, they will be required to provide extensive business details before proceeding.
- **Form Layout:**
  1. Admin Name
  2. Admin Email (Read-only, pulled directly from their verified Clerk account to prevent fake domains)
  3. Admin Telephone
  4. Business Name
  5. Business Address
  6. Employer Count (1-10, 10-50, 50-100, 100+)
  7. Terms & Conditions Checkbox (with a note about future subscription terms above the button)

- **Business Email Validation:** 
  - The system will reject public email domains (e.g., `@gmail.com`, `@yahoo.com`, `@hotmail.com`, `@outlook.com`) on the verified Clerk email.
  - **Domain Matching Check:** The verified Clerk email domain (e.g., `acme.com`) must reflect the entered Business Name (e.g., `Acme Corp`) with at least a 50% text similarity match.
  - If the domain does not match the business name closely enough, the system will prevent registration and display a prompt: *"Your email domain does not appear to match your business name. Please register with a matching corporate email, or contact info@firevision.uk with your details for manual approval."*

### 2. The "Pending Approval" Gate
**The Problem:** We cannot allow instant access to the Admin Dashboard upon form submission.
**The Solution:** 
- The database schema will be updated to include an `approvalStatus` (`pending`, `approved`, `rejected`) for Admin users.
- Upon completing the setup form, the Admin will NOT see the dashboard. Instead, they will be locked on a "Pending" screen (which includes the Firevision logo).
- **Message Displayed:** *"Registration Successful. Firevision will confirm your details and contact you to activate your admin account."*

### 3. Backend & Data Schema Updates
- **Convex Schema Changes:** Add `businessName`, `businessAddress`, `employerCount`, `agreedToSubscription`, and `approvalStatus` to the `users` table. (Note: Kept optional at the root schema level to prevent crashing Guest registrations, but strictly mandated in the API endpoint).
- **API Enforcements:** The `updateAdminProfile` API mutation strictly requires all business fields to prevent bypasses.

## Verification & Rollout
This ensures that the app on Google Play can be downloaded by anyone, but only genuine businesses vetted by Firevision can trigger evacuations and send push notifications.
