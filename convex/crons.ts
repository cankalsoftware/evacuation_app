/**
 * @file crons.ts
 * @description Central registry for Convex background cron jobs.
 * Registers intervals and schedules for automated tasks like sending welcome emails,
 * triggering automated evacuation drills, and cleaning up stale data.
 * 
 * @module ConvexCrons
 */
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
