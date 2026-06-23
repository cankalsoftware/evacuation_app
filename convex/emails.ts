/**
 * @file emails.ts
 * @description Handles external email communication via SMTP (Nodemailer).
 * Integrates directly with Resend/SendGrid/SMTP to send activation emails to new Admins,
 * as well as internal system notifications.
 * 
 * @module ConvexEmails
 */
"use node";

import { action, internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import nodemailer from "nodemailer";

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "465", 10),
    secure: parseInt(process.env.SMTP_PORT || "465", 10) === 465, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
  });
}

// Action called from the client when an Admin completes the setup form
export const notifyFireVisionNewAdmin = action({
  args: {
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    businessName: v.string(),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    // We only want to send this if credentials exist
    if (!process.env.SMTP_HOST) {
      console.warn("SMTP_HOST not set. Skipping email notification.");
      return;
    }

    const transporter = createTransporter();

    try {
      await transporter.sendMail({
        from: `"FireVision System" <${process.env.SMTP_USER}>`,
        to: "info@firevision.uk",
        subject: `⚠️ URGENT: New Admin Account Pending Approval`,
        text: `
A new Admin account has just completed the setup process and is waiting for your approval in the Convex Dashboard.

Details:
- Name: ${args.name}
- Email: ${args.email}
- Business Name: ${args.businessName}
- Phone: ${args.phone}
- Clerk ID: ${args.clerkId}

Please log into the Convex Dashboard, verify their details, and change their approvalStatus from "pending" to "approved".
`,
      });
      console.log(`Notification sent to info@firevision.uk for ${args.email}`);
    } catch (error) {
      console.error("Failed to send new admin notification email", error);
    }
  },
});

// Internal Action called by the Cron Job to send the welcome/activation email
export const sendAdminActivationEmail = internalAction({
  args: {
    userId: v.id("users"),
    email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    if (!process.env.SMTP_HOST) {
      console.warn("SMTP_HOST not set. Skipping activation email.");
      return;
    }

    const transporter = createTransporter();

    try {
      await transporter.sendMail({
        from: `"FireVision System" <${process.env.SMTP_USER}>`,
        to: args.email,
        subject: `✅ Your FireVision Admin Account is Approved!`,
        text: `
Hello ${args.name},

Great news! Your FireVision Admin account has been successfully approved and activated.
You can now log into the FireVision Evacuation App and begin managing your buildings, sites, and emergency plans.

If you have any questions, please contact info@firevision.uk.

Stay Safe,
The FireVision Team
`,
      });
      console.log(`Activation email sent to ${args.email}`);
      
      // Mark the user as having received the email so we don't send it again
      await ctx.runMutation(internal.users.markActivationEmailSent, { userId: args.userId });
    } catch (error) {
      console.error("Failed to send activation email", error);
    }
  },
});

export const processActivationEmailsCron = internalAction({
  args: {},
  handler: async (ctx) => {
    const pendingAdmins = await ctx.runQuery(internal.users.getPendingActivationAdmins);
    for (const admin of pendingAdmins) {
      if (admin.email && admin.name) {
        await ctx.runAction(internal.emails.sendAdminActivationEmail, {
          userId: admin._id,
          email: admin.email,
          name: admin.name,
        });
      }
    }
  },
});

