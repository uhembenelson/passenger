import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("expire offers and reservations", { minutes: 5 }, internal.maintenance.expire, {});

export default crons;
