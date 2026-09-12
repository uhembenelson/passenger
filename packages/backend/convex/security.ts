import { v } from "convex/values";
import { PERMISSIONS } from "@passenger/core";
import type { PermissionKey } from "@passenger/core";
import { mutation, action } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireUser, isStaff, isAdmin, requireAdmin, requirePermission, audit, fail } from "./lib";
import { createAccount, retrieveAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { api } from "./_generated/api";

async function recordAction(
  ctx: MutationCtx,
  actor: Doc<"users">,
  actionTaken: string,
  affectedSection = "Security & Compliance",
) {
  await ctx.db.insert("securityEvents", {
    kind: "admin_action",
    actorId: actor._id,
    actorName: actor.name,
    ...(actor.email ? { actorEmail: actor.email } : {}),
    actorPhone: actor.phone,
    detail: actionTaken,
    affectedSection,
    createdAt: Date.now(),
  });
}

const nameRule = (value: string, label = "Role title", max = 60) => {
  const name = value.trim();
  if (!name || name.length > max) fail(`${label} must be 1–${max} characters.`);
  return name;
};

const emailRule = (value: string) => {
  const email = value.trim();
  if (email.length < 5 || email.length > 200 || !email.includes("@")) fail("Enter a valid email address.");
  return email;
};

export const createRole = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SECURITY_MANAGE);
    const name = nameRule(args.name);
    const existing = await ctx.db.query("adminRoles").withIndex("by_created").collect();
    if (existing.some(role => role.name.trim().toLowerCase() === name.toLowerCase())) fail("An admin role with that title already exists.");
    const now = Date.now();
    const id = await ctx.db.insert("adminRoles", { name, createdAt: now, updatedAt: now });
    await audit(ctx, user, "security.role.created", `Created admin role: ${name}`);
    await recordAction(ctx, user, `Created admin role: ${name}`);
    return id;
  },
});

export const updateRole = mutation({
  args: { id: v.id("adminRoles"), name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SECURITY_MANAGE);
    const name = nameRule(args.name);
    const existing = await ctx.db.get(args.id);
    if (!existing) fail("Admin role not found.");
    const probe = await ctx.db.query("adminRoles").withIndex("by_created").collect();
    if (probe.some(role => role._id !== args.id && role.name.trim().toLowerCase() === name.toLowerCase())) fail("An admin role with that title already exists.");
    await ctx.db.patch(args.id, { name, updatedAt: Date.now() });
    await audit(ctx, user, "security.role.updated", `Renamed admin role: ${existing.name} → ${name}`);
    await recordAction(ctx, user, `Renamed admin role: ${existing.name} → ${name}`);
  },
});

export const removeRole = mutation({
  args: { id: v.id("adminRoles") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SECURITY_MANAGE);
    const role = await ctx.db.get(args.id);
    if (!role) fail("Admin role not found.");
    const members = await ctx.db.query("teamMembers").withIndex("by_adminRole", q => q.eq("adminRoleId", args.id)).collect();
    for (const member of members) await ctx.db.delete(member._id);
    const grants = await ctx.db.query("permissionGrants").withIndex("by_adminRole", q => q.eq("adminRoleId", args.id)).collect();
    for (const grant of grants) await ctx.db.delete(grant._id);
    await ctx.db.delete(args.id);
    await audit(ctx, user, "security.role.deleted", `Deleted admin role: ${role.name} (${members.length} team member${members.length === 1 ? "" : "s"} removed)`);
    await recordAction(ctx, user, `Deleted admin role: ${role.name}`);
  },
});

export const createTeamMember = mutation({
  args: { adminRoleId: v.id("adminRoles"), name: v.string(), email: v.string(), roleTitle: v.string(), mustChangePassword: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SECURITY_MANAGE);
    const role = await ctx.db.get(args.adminRoleId);
    if (!role) fail("Admin role not found.");
    const name = nameRule(args.name, "Name", 120);
    const email = emailRule(args.email);
    const roleTitle = nameRule(args.roleTitle, "Role title", 100);
    const now = Date.now();
    const id = await ctx.db.insert("teamMembers", { adminRoleId: args.adminRoleId, name, email, roleTitle, mustChangePassword: args.mustChangePassword ?? false, createdAt: now, updatedAt: now });
    await audit(ctx, user, "security.member.created", `Added team member ${name} (${roleTitle}) to ${role.name}`);
    await recordAction(ctx, user, `Added team member: ${name} (${roleTitle}) to ${role.name}`);
    return id;
  },
});

export const updateTeamMember = mutation({
  args: { id: v.id("teamMembers"), adminRoleId: v.id("adminRoles"), name: v.string(), email: v.string(), roleTitle: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SECURITY_MANAGE);
    const existing = await ctx.db.get(args.id);
    if (!existing) fail("Team member not found.");
    const role = await ctx.db.get(args.adminRoleId);
    if (!role) fail("Admin role not found.");
    const name = nameRule(args.name, "Name", 120);
    const email = emailRule(args.email);
    const roleTitle = nameRule(args.roleTitle, "Role title", 100);
    await ctx.db.patch(args.id, { adminRoleId: args.adminRoleId, name, email, roleTitle, updatedAt: Date.now() });
    await audit(ctx, user, "security.member.updated", `Updated team member: ${existing.name}`);
    await recordAction(ctx, user, `Updated team member: ${name} (${roleTitle}) in ${role.name}`);
  },
});

export const removeTeamMember = mutation({
  args: { id: v.id("teamMembers") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SECURITY_MANAGE);
    const member = await ctx.db.get(args.id);
    if (!member) fail("Team member not found.");
    await ctx.db.delete(args.id);
    await audit(ctx, user, "security.member.deleted", `Removed team member: ${member.name}`);
    await recordAction(ctx, user, `Removed team member: ${member.name}`);
  },
});

export const createPermission = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SECURITY_MANAGE);
    const name = nameRule(args.name, "Permission", 120);
    const existing = await ctx.db.query("permissions").withIndex("by_created").collect();
    if (existing.some(permission => permission.name.trim().toLowerCase() === name.toLowerCase())) fail("A permission with that name already exists.");
    const now = Date.now();
    const id = await ctx.db.insert("permissions", { name, createdAt: now, updatedAt: now });
    await audit(ctx, user, "security.permission.created", `Created permission: ${name}`);
    await recordAction(ctx, user, `Created permission: ${name}`);
    return id;
  },
});

export const updatePermission = mutation({
  args: { id: v.id("permissions"), name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SECURITY_MANAGE);
    const name = nameRule(args.name, "Permission", 120);
    const existing = await ctx.db.get(args.id);
    if (!existing) fail("Permission not found.");
    const probe = await ctx.db.query("permissions").withIndex("by_created").collect();
    if (probe.some(permission => permission._id !== args.id && permission.name.trim().toLowerCase() === name.toLowerCase())) fail("A permission with that name already exists.");
    await ctx.db.patch(args.id, { name, updatedAt: Date.now() });
    await audit(ctx, user, "security.permission.updated", `Renamed permission: ${existing.name} → ${name}`);
    await recordAction(ctx, user, `Renamed permission: ${existing.name} → ${name}`);
  },
});

export const removePermission = mutation({
  args: { id: v.id("permissions") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SECURITY_MANAGE);
    const existing = await ctx.db.get(args.id);
    if (!existing) fail("Permission not found.");
    const grants = await ctx.db.query("permissionGrants").withIndex("by_permission", q => q.eq("permissionId", args.id)).collect();
    for (const grant of grants) await ctx.db.delete(grant._id);
    await ctx.db.delete(args.id);
    await audit(ctx, user, "security.permission.deleted", `Deleted permission: ${existing.name} (${grants.length} grant${grants.length === 1 ? "" : "s"} removed)`);
    await recordAction(ctx, user, `Deleted permission: ${existing.name}`);
  },
});

export const setPermissionGrant = mutation({
  args: { permissionId: v.id("permissions"), adminRoleId: v.id("adminRoles"), roleTitle: v.string(), granted: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SECURITY_MANAGE);
    const permission = await ctx.db.get(args.permissionId);
    if (!permission) fail("Permission not found.");
    const role = await ctx.db.get(args.adminRoleId);
    if (!role) fail("Admin role not found.");
    const roleTitle = nameRule(args.roleTitle, "Role title", 100);
    const grant = (await ctx.db.query("permissionGrants").withIndex("by_permission", q => q.eq("permissionId", args.permissionId)).collect()).find(g => g.adminRoleId === args.adminRoleId && g.roleTitle === roleTitle);
    if (args.granted && !grant) {
      const now = Date.now();
      await ctx.db.insert("permissionGrants", { permissionId: args.permissionId, adminRoleId: args.adminRoleId, roleTitle, granted: true, createdAt: now, updatedAt: now });
      await audit(ctx, user, "security.grant.granted", `Granted "${permission.name}" to ${roleTitle}`);
      await recordAction(ctx, user, `Granted "${permission.name}" to ${roleTitle}`);
    } else if (args.granted && grant && !grant.granted) {
      await ctx.db.patch(grant._id, { granted: true, updatedAt: Date.now() });
      await audit(ctx, user, "security.grant.granted", `Granted "${permission.name}" to ${roleTitle}`);
      await recordAction(ctx, user, `Granted "${permission.name}" to ${roleTitle}`);
    } else if (!args.granted && grant && grant.granted) {
      await ctx.db.delete(grant._id);
      await audit(ctx, user, "security.grant.removed", `Removed "${permission.name}" from ${roleTitle}`);
      await recordAction(ctx, user, `Removed "${permission.name}" from ${roleTitle}`);
    }
  },
});

export const recordStaffLogin = mutation({
  args: { deviceInfo: v.optional(v.string()), ipAddress: v.optional(v.string()), location: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!isStaff(user)) fail("Administrator access required.");
    await ctx.db.insert("securityEvents", {
      kind: "login",
      actorId: user._id,
      actorName: user.name,
      ...(user.email ? { actorEmail: user.email } : {}),
      actorPhone: user.phone,
      detail: "Staff sign-in",
      ...(args.ipAddress ? { ipAddress: args.ipAddress } : {}),
      ...(args.deviceInfo ? { deviceInfo: args.deviceInfo } : {}),
      ...(args.location ? { location: args.location } : {}),
      createdAt: Date.now(),
    });
  },
});

export const ensureSeed = mutation({
  args: {},
  handler: async (ctx) => {
    const seedUser = await requireAdmin(ctx);
    const now = Date.now();
    const permissionSeeds: PermissionKey[] = [
      PERMISSIONS.USERS_VIEW, PERMISSIONS.USERS_MANAGE,
      PERMISSIONS.DELIVERIES_VIEW, PERMISSIONS.DELIVERIES_MANAGE,
      PERMISSIONS.TRIPS_VIEW, PERMISSIONS.TRIPS_MANAGE,
      PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.PAYMENTS_MANAGE,
      PERMISSIONS.SUPPORT_VIEW, PERMISSIONS.SUPPORT_MANAGE,
      PERMISSIONS.COMPLIANCE_VIEW, PERMISSIONS.COMPLIANCE_MANAGE,
      PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_MANAGE,
      PERMISSIONS.SECURITY_VIEW, PERMISSIONS.SECURITY_MANAGE,
      PERMISSIONS.MONITORING_VIEW, PERMISSIONS.NOTIFICATIONS_VIEW,
    ];
    const roleGrantMatrix: Record<PermissionKey, boolean[]> = {
      [PERMISSIONS.USERS_VIEW]:       [true, true, true],
      [PERMISSIONS.USERS_MANAGE]:     [false, true, true],
      [PERMISSIONS.DELIVERIES_VIEW]:  [true, true, true],
      [PERMISSIONS.DELIVERIES_MANAGE]: [false, false, true],
      [PERMISSIONS.TRIPS_VIEW]:       [true, true, true],
      [PERMISSIONS.TRIPS_MANAGE]:     [false, false, true],
      [PERMISSIONS.PAYMENTS_VIEW]:    [true, false, true],
      [PERMISSIONS.PAYMENTS_MANAGE]:  [false, false, true],
      [PERMISSIONS.SUPPORT_VIEW]:     [false, true, true],
      [PERMISSIONS.SUPPORT_MANAGE]:   [false, true, false],
      [PERMISSIONS.COMPLIANCE_VIEW]:  [false, true, true],
      [PERMISSIONS.COMPLIANCE_MANAGE]: [false, true, false],
      [PERMISSIONS.SETTINGS_VIEW]:    [false, false, true],
      [PERMISSIONS.SETTINGS_MANAGE]:  [false, false, true],
      [PERMISSIONS.SECURITY_VIEW]:    [false, false, true],
      [PERMISSIONS.SECURITY_MANAGE]:  [false, false, true],
      [PERMISSIONS.MONITORING_VIEW]:  [true, true, true],
      [PERMISSIONS.NOTIFICATIONS_VIEW]: [true, true, true],
    };
    const existingRoles = await ctx.db.query("adminRoles").withIndex("by_created").collect();
    if (existingRoles.length) {
      const allKeys = Object.values(PERMISSIONS) as PermissionKey[];
      const existingPerms = await ctx.db.query("permissions").withIndex("by_created").collect();
      const known = new Set<string>(allKeys);
      const stale = existingPerms.filter(permission => !known.has(permission.name));
      for (const permission of stale) {
        const grants = await ctx.db.query("permissionGrants").withIndex("by_permission", q => q.eq("permissionId", permission._id)).collect();
        for (const grant of grants) await ctx.db.delete("permissionGrants", grant._id);
        await ctx.db.delete("permissions", permission._id);
      }
      const present = new Set(existingPerms.map(permission => permission.name));
      const missing = permissionSeeds.filter(key => !present.has(key));
      for (const key of missing) {
        const permissionId = await ctx.db.insert("permissions", { name: key, createdAt: now, updatedAt: now });
        for (let roleIdx = 0; roleIdx < existingRoles.length; roleIdx++) {
          const role = existingRoles[roleIdx]!;
          const grants = await ctx.db.query("permissionGrants").withIndex("by_permission", q => q.eq("permissionId", permissionId)).collect();
          const existing = grants.find(grant => grant.adminRoleId === role._id && grant.roleTitle === role.name);
          if (existing) continue;
          await ctx.db.insert("permissionGrants", {
            permissionId,
            adminRoleId: role._id,
            roleTitle: role.name,
            granted: roleGrantMatrix[key]![roleIdx] ?? false,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      await audit(ctx, seedUser, "security.permissions.migrated", `Synchronized permissions to current set (${permissionSeeds.length} keys, ${missing.length} added).`);
      return;
    }

    const roleNames = ["Sales & Marketing", "Customer Support", "Operations"];
    const roleIds: Id<"adminRoles">[] = [];
    for (const name of roleNames) roleIds.push(await ctx.db.insert("adminRoles", { name, createdAt: now, updatedAt: now }));

    const memberSeeds: { roleIndex: number; name: string; email: string; roleTitle: string }[] = [
      { roleIndex: 0, name: "John Doe", email: "john@email.com", roleTitle: "Marketing Manager" },
      { roleIndex: 0, name: "Jane Doe", email: "jane@email.com", roleTitle: "Market Researcher" },
      { roleIndex: 0, name: "David Doe", email: "david@email.com", roleTitle: "Content Marketer" },
      { roleIndex: 1, name: "Sarah Lee", email: "sarah@email.com", roleTitle: "Support Lead" },
      { roleIndex: 1, name: "Mike Brown", email: "mike@email.com", roleTitle: "Support Agent" },
      { roleIndex: 2, name: "Emma Wilson", email: "emma@email.com", roleTitle: "Operations Manager" },
    ];
    for (const seed of memberSeeds) {
      await ctx.db.insert("teamMembers", { adminRoleId: roleIds[seed.roleIndex]!, name: seed.name, email: seed.email, roleTitle: seed.roleTitle, createdAt: now, updatedAt: now });
    }

    const permissionIds: Id<"permissions">[] = [];
    for (const name of permissionSeeds) permissionIds.push(await ctx.db.insert("permissions", { name, createdAt: now, updatedAt: now }));

    for (let index = 0; index < permissionSeeds.length; index++) {
      const grants = roleGrantMatrix[permissionSeeds[index]!]!;
      for (let roleIdx = 0; roleIdx < roleIds.length; roleIdx++) {
        await ctx.db.insert("permissionGrants", { permissionId: permissionIds[index]!, adminRoleId: roleIds[roleIdx]!, roleTitle: roleNames[roleIdx]!, granted: grants[roleIdx] ?? false, createdAt: now, updatedAt: now });
      }
    }

    const eventSeeds: { kind: "login" | "failed_login" | "admin_action"; actorName: string; actorEmail?: string; actorPhone?: string; detail: string; affectedSection?: string; attempts?: number; ipAddress?: string; deviceInfo?: string; location?: string; hoursAgo: number }[] = [
      { kind: "failed_login", actorName: "John Doe", actorEmail: "john@email.com", actorPhone: "+2348076534218", detail: "Too many failed sign-in attempts", attempts: 5, ipAddress: "192.168.1.2", deviceInfo: "Chrome, Windows", location: "Lagos, Nigeria", hoursAgo: 36 },
      { kind: "failed_login", actorName: "Jane Doe", actorEmail: "jane@email.com", actorPhone: "+2348098765432", detail: "Too many failed sign-in attempts", attempts: 2, ipAddress: "10.0.0.7", deviceInfo: "Safari, iPhone", location: "Abuja, Nigeria", hoursAgo: 10 },
      { kind: "failed_login", actorName: "David Doe", actorEmail: "david@email.com", actorPhone: "+2348111222333", detail: "Suspicious sign-in from new device", attempts: 5, ipAddress: "203.0.113.9", deviceInfo: "Firefox, macOS", location: "Lagos, Nigeria", hoursAgo: 2 },
      { kind: "admin_action", actorName: "John Doe", actorEmail: "john@email.com", actorPhone: "+2348076534218", detail: "Edited Transaction Fee", affectedSection: "System Settings", ipAddress: "192.168.1.2", hoursAgo: 30 },
      { kind: "admin_action", actorName: "John Doe", actorEmail: "john@email.com", actorPhone: "+2348076534218", detail: "Created Escrow Policy", affectedSection: "System Settings", ipAddress: "192.168.1.2", hoursAgo: 26 },
      { kind: "admin_action", actorName: "John Doe", actorEmail: "john@email.com", actorPhone: "+2348076534218", detail: "Deleted a User Account", affectedSection: "Users", ipAddress: "192.168.1.2", hoursAgo: 5 },
    ];
    for (const seed of eventSeeds) {
      await ctx.db.insert("securityEvents", {
        kind: seed.kind,
        actorName: seed.actorName,
        ...(seed.actorEmail ? { actorEmail: seed.actorEmail } : {}),
        ...(seed.actorPhone ? { actorPhone: seed.actorPhone } : {}),
        detail: seed.detail,
        ...(seed.affectedSection ? { affectedSection: seed.affectedSection } : {}),
        ...(seed.attempts !== undefined ? { attempts: seed.attempts } : {}),
        ...(seed.ipAddress ? { ipAddress: seed.ipAddress } : {}),
        ...(seed.deviceInfo ? { deviceInfo: seed.deviceInfo } : {}),
        ...(seed.location ? { location: seed.location } : {}),
        createdAt: now - seed.hoursAgo * 60 * 60 * 1000,
      });
    }

    await audit(ctx, seedUser, "security.seeded", "Initialized default admin roles, team members, and permissions.");
  },
});

function generateTempPassword(length = 16) {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%^&*";
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  let pw = [pick(upper), pick(lower), pick(digits), pick(special)];
  for (let i = pw.length; i < length; i++) pw.push(pick(upper + lower + digits + special));
  return pw.sort(() => Math.random() - 0.5).join("");
}

export const inviteTeamMember = action({
  args: { name: v.string(), email: v.string(), roleTitle: v.string(), adminRoleId: v.id("adminRoles") },
  returns: v.object({ tempPassword: v.string(), memberId: v.id("teamMembers") }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) fail("Authentication required.");
    const tempPassword = generateTempPassword();
    const now = Date.now();
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Enter a valid email address.");
    const memberId: Id<"teamMembers"> = await ctx.runMutation(api.security.createTeamMember, { name: args.name, email, roleTitle: args.roleTitle, adminRoleId: args.adminRoleId, mustChangePassword: true });
    const profile = { email, subject: email, name: args.name.trim(), phone: "", verification: "required" as const, joinedAt: now };
    try {
      await createAccount(ctx, { provider: "password", account: { id: email, secret: tempPassword }, profile });
    } catch {
      await modifyAccountCredentials(ctx, { provider: "password", account: { id: email, secret: tempPassword } });
    }
    return { tempPassword, memberId };
  },
});

export const setOwnPassword = action({
  args: { currentPassword: v.string(), newPassword: v.string() },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) fail("Authentication required.");
    const email = (identity.email ?? "").trim().toLowerCase();
    if (!email) fail("No email on your account.");
    if (args.newPassword.length < 10 || !/[a-z]/.test(args.newPassword) || !/[A-Z]/.test(args.newPassword) || !/\d/.test(args.newPassword)) {
      fail("Use at least 10 characters with uppercase, lowercase, and a number.");
    }
    await retrieveAccount(ctx, { provider: "password", account: { id: email, secret: args.currentPassword } });
    await modifyAccountCredentials(ctx, { provider: "password", account: { id: email, secret: args.newPassword } });
    await ctx.runMutation(api.security.clearMustChangePassword, { email });
    return { success: true };
  },
});

export const clearMustChangePassword = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const email = args.email.trim().toLowerCase();
    const callerEmail = (user.email ?? "").trim().toLowerCase();
    if (!isAdmin(user) && callerEmail !== email) fail("You can only change your own password.");
    const members = await ctx.db.query("teamMembers").collect();
    const member = members.find(m => m.email.toLowerCase() === email);
    if (member && member.mustChangePassword) {
      await ctx.db.patch(member._id, { mustChangePassword: false, updatedAt: Date.now() });
      await audit(ctx, user, "security.password.changed", `${member.name} changed their password.`);
    }
  },
});