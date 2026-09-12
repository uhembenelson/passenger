import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("expire offers and reservations", { minutes: 5 }, internal.maintenance.expire, {});

crons.interval("process automatic traveller payouts", { minutes: 5 }, internal.financeState.sweepPayouts, {});

crons.interval("reconcile wallet deposits", { minutes: 5 }, internal.wallet.sweepDeposits, {});

crons.interval("reconcile outgoing payments", { minutes: 5 }, internal.financeState.sweepOperations, {});
crons.interval("reconcile provider refunds", { hours: 1 }, internal.payments.sweepRefunds, {});

export default crons;
