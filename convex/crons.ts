import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Runs every 5 minutes to send welcome emails to newly approved admins
crons.interval(
  "send-admin-activation-emails",
  { minutes: 5 },
  internal.emails.processActivationEmailsCron
);

export default crons;
