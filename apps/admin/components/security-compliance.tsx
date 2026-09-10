"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Check, EllipsisVertical, X } from "lucide-react";

export type SecurityTab = "roles" | "suspicious" | "audit";
export type RoleDetailTab = "team" | "permissions";

export interface AdminRoleItem {
  id: string;
  name: string;
  memberCount: number;
}

export interface TeamMemberItem {
  id: string;
  role: string;
  name: string;
  email: string;
}

export interface PermissionRow {
  id: string;
  permission: string;
  roles: Record<string, boolean>; // e.g. { "Marketing Manager": true, "Market Researcher": false, "Content Marketer": true }
}

export interface SuspiciousActivityItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  attempts: number;
}

export interface AdminLoginLog {
  id: string;
  name: string;
  dateTime: string;
  ipAddress: string;
  deviceInfo: string;
  location: string;
}

export interface AdminActionLog {
  id: string;
  name: string;
  dateTime: string;
  actionTaken: string;
  affectedSection: string;
  ipAddress: string;
}

const INITIAL_ROLES: AdminRoleItem[] = [
  { id: "role-1", name: "Sales & Marketing", memberCount: 5 },
  { id: "role-2", name: "Customer Support", memberCount: 8 },
  { id: "role-3", name: "Operations", memberCount: 2 },
];

const INITIAL_TEAM: TeamMemberItem[] = [
  { id: "tm-1", role: "Marketing Manager", name: "John Doe", email: "john@email.com" },
  { id: "tm-2", role: "Market Researcher", name: "Jane Doe", email: "jane@email.com" },
  { id: "tm-3", role: "Content Marketer", name: "David Doe", email: "david@email.com" },
];

const INITIAL_PERMISSIONS: PermissionRow[] = [
  {
    id: "perm-1",
    permission: "Can add users",
    roles: { "Marketing Manager": true, "Market Researcher": true, "Content Marketer": false },
  },
  {
    id: "perm-2",
    permission: "Can add products to store",
    roles: { "Marketing Manager": true, "Market Researcher": true, "Content Marketer": false },
  },
  {
    id: "perm-3",
    permission: "Can add rider to an order",
    roles: { "Marketing Manager": true, "Market Researcher": false, "Content Marketer": true },
  },
  {
    id: "perm-4",
    permission: "Can approve/reject store creation request",
    roles: { "Marketing Manager": true, "Market Researcher": true, "Content Marketer": false },
  },
  {
    id: "perm-5",
    permission: "Can process payout",
    roles: { "Marketing Manager": true, "Market Researcher": true, "Content Marketer": true },
  },
  {
    id: "perm-6",
    permission: "Can process refund",
    roles: { "Marketing Manager": true, "Market Researcher": true, "Content Marketer": true },
  },
  {
    id: "perm-7",
    permission: "Can create/add a coupon",
    roles: { "Marketing Manager": true, "Market Researcher": true, "Content Marketer": true },
  },
  {
    id: "perm-8",
    permission: "Can update order status",
    roles: { "Marketing Manager": true, "Market Researcher": false, "Content Marketer": true },
  },
  {
    id: "perm-9",
    permission: "Can update delivery status",
    roles: { "Marketing Manager": true, "Market Researcher": false, "Content Marketer": true },
  },
];

const INITIAL_SUSPICIOUS: SuspiciousActivityItem[] = [
  { id: "sus-1", name: "John Doe", email: "john@email.com", phone: "08076534218", attempts: 5 },
  { id: "sus-2", name: "John Doe", email: "john@email.com", phone: "08076534218", attempts: 5 },
  { id: "sus-3", name: "John Doe", email: "john@email.com", phone: "08076534218", attempts: 5 },
];

const INITIAL_LOGINS: AdminLoginLog[] = [
  { id: "login-1", name: "John Doe", dateTime: "Feb 11, 2025, 14:05", ipAddress: "192.168.1.2", deviceInfo: "Chrome, Windows", location: "Lagos, Nigeria" },
  { id: "login-2", name: "John Doe", dateTime: "Feb 11, 2025, 14:05", ipAddress: "192.168.1.2", deviceInfo: "Safari, iPhone", location: "Lagos, Nigeria" },
  { id: "login-3", name: "John Doe", dateTime: "Feb 11, 2025, 14:05", ipAddress: "192.168.1.2", deviceInfo: "Firefox, MacOS", location: "Lagos, Nigeria" },
];

const INITIAL_ACTIONS: AdminActionLog[] = [
  { id: "act-1", name: "John Doe", dateTime: "Feb 11, 2025, 14:05", actionTaken: "Edited Transaction Fee", affectedSection: "System Settings", ipAddress: "192.168.1.2" },
  { id: "act-2", name: "John Doe", dateTime: "Feb 11, 2025, 14:05", actionTaken: "Created Escrow Policy", affectedSection: "System Settings", ipAddress: "192.168.1.2" },
  { id: "act-3", name: "John Doe", dateTime: "Feb 11, 2025, 14:05", actionTaken: "Deleted a User Account", affectedSection: "Users", ipAddress: "192.168.1.2" },
];

export function SecurityCompliance() {
  const [activeTab, setActiveTab] = useState<SecurityTab>("roles");
  const [selectedRole, setSelectedRole] = useState<AdminRoleItem | null>(null);
  const [roleDetailTab, setRoleDetailTab] = useState<RoleDetailTab>("team");

  // State data
  const [roles, setRoles] = useState<AdminRoleItem[]>(INITIAL_ROLES);
  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>(INITIAL_TEAM);
  const [permissions, setPermissions] = useState<PermissionRow[]>(INITIAL_PERMISSIONS);
  const [suspiciousList, setSuspiciousList] = useState<SuspiciousActivityItem[]>(INITIAL_SUSPICIOUS);
  const [loginsList, setLoginsList] = useState<AdminLoginLog[]>(INITIAL_LOGINS);
  const [actionsList, setActionsList] = useState<AdminActionLog[]>(INITIAL_ACTIONS);

  // Menu popover
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Modals
  const [addRoleModalOpen, setAddRoleModalOpen] = useState(false);
  const [addTeamModalOpen, setAddTeamModalOpen] = useState(false);
  const [addPermissionModalOpen, setAddPermissionModalOpen] = useState(false);
  const [isEditingPermissions, setIsEditingPermissions] = useState(false);

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside() {
      setActiveMenuId(null);
    }
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  const subRoles = ["Marketing Manager", "Market Researcher", "Content Marketer"];

  // Toggle permission cell
  const handleTogglePermission = (permId: string, roleName: string) => {
    setPermissions((prev) =>
      prev.map((row) => {
        if (row.id !== permId) return row;
        return {
          ...row,
          roles: {
            ...row.roles,
            [roleName]: !row.roles[roleName],
          },
        };
      })
    );
  };

  // If a role is selected, render the Drilldown View (e.g. Sales and Marketing)
  if (selectedRole) {
    return (
      <section className="figma-security-page">
        {/* Drilldown Header with back button */}
        <div className="figma-security-drilldown-header">
          <button
            type="button"
            className="figma-security-back-btn"
            onClick={() => setSelectedRole(null)}
            aria-label="Back to Admin Roles"
          >
            <ArrowLeft size={20} />
          </button>
          <h1>{selectedRole.name}</h1>
        </div>

        {/* Drilldown Subtabs */}
        <div className="figma-settings-tabs-bar">
          <button
            type="button"
            className={`figma-settings-tab ${roleDetailTab === "team" ? "active" : ""}`}
            onClick={() => setRoleDetailTab("team")}
          >
            Team
          </button>
          <button
            type="button"
            className={`figma-settings-tab ${roleDetailTab === "permissions" ? "active" : ""}`}
            onClick={() => setRoleDetailTab("permissions")}
          >
            Permissions
          </button>
        </div>

        {/* Team Tab Content */}
        {roleDetailTab === "team" && (
          <>
            <div className="figma-settings-action-bar">
              <button
                type="button"
                className="figma-settings-add-btn"
                onClick={() => setAddTeamModalOpen(true)}
              >
                Add new team member
              </button>
            </div>

            <div className="figma-settings-table-card">
              <table className="figma-settings-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Name</th>
                    <th>Email address</th>
                    <th className="th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teamMembers.map((member) => (
                    <tr key={member.id}>
                      <td>{member.role}</td>
                      <td>{member.name}</td>
                      <td>{member.email}</td>
                      <td className="td-actions">
                        <div className="figma-settings-menu-wrapper">
                          <button
                            type="button"
                            className="figma-settings-menu-trigger"
                            aria-label="Actions"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(activeMenuId === member.id ? null : member.id);
                            }}
                          >
                            <EllipsisVertical size={18} />
                          </button>
                          {activeMenuId === member.id && (
                            <div
                              className="figma-settings-dropdown-menu"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuId(null);
                                }}
                              >
                                Edit Member
                              </button>
                              <div className="figma-settings-dropdown-divider" />
                              <button
                                type="button"
                                className="danger-item"
                                onClick={() => {
                                  setActiveMenuId(null);
                                  setTeamMembers((prev) => prev.filter((m) => m.id !== member.id));
                                }}
                              >
                                Remove Member
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {teamMembers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="figma-empty-row">No team members assigned</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Permissions Matrix Tab Content */}
        {roleDetailTab === "permissions" && (
          <>
            <div className="figma-settings-action-bar figma-permissions-action-bar">
              <button
                type="button"
                className={`btn-cancel figma-permissions-edit-btn ${isEditingPermissions ? "editing" : ""}`}
                onClick={() => setIsEditingPermissions(!isEditingPermissions)}
              >
                {isEditingPermissions ? "Done Editing" : "Edit Permissions"}
              </button>
              <button
                type="button"
                className="figma-settings-add-btn"
                onClick={() => setAddPermissionModalOpen(true)}
              >
                Add Permissions
              </button>
            </div>

            <div className="figma-settings-table-card">
              <table className="figma-settings-table figma-permissions-table">
                <thead>
                  <tr>
                    <th style={{ width: "40%" }}>Permissions</th>
                    {subRoles.map((r) => (
                      <th key={r} style={{ textAlign: "center", width: "20%" }}>
                        {r}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permissions.map((row) => (
                    <tr key={row.id}>
                      <td>{row.permission}</td>
                      {subRoles.map((r) => {
                        const isChecked = !!row.roles[r];
                        return (
                          <td key={r} style={{ textAlign: "center" }}>
                            <button
                              type="button"
                              className={`figma-matrix-checkbox ${isChecked ? "checked" : ""}`}
                              onClick={() => handleTogglePermission(row.id, r)}
                              aria-label={`${row.permission} for ${r}`}
                            >
                              {isChecked && <Check size={14} strokeWidth={3} />}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {permissions.length === 0 && (
                    <tr>
                      <td colSpan={4} className="figma-empty-row">No permissions configured</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Modal: Add Team Member */}
        {addTeamModalOpen && (
          <AddTeamMemberModal
            onClose={() => setAddTeamModalOpen(false)}
            onAdd={(member) => {
              setTeamMembers((prev) => [...prev, { ...member, id: `tm-${Date.now()}` }]);
              setAddTeamModalOpen(false);
            }}
          />
        )}

        {/* Modal: Add Permission */}
        {addPermissionModalOpen && (
          <AddPermissionModal
            onClose={() => setAddPermissionModalOpen(false)}
            onAdd={(permName) => {
              setPermissions((prev) => [
                ...prev,
                {
                  id: `perm-${Date.now()}`,
                  permission: permName,
                  roles: {
                    "Marketing Manager": true,
                    "Market Researcher": false,
                    "Content Marketer": false,
                  },
                },
              ]);
              setAddPermissionModalOpen(false);
            }}
          />
        )}
      </section>
    );
  }

  // Main View: Security and Compliance with 3 Tabs
  return (
    <section className="figma-security-page">
      <div className="figma-settings-header">
        <h1>Security and Compliance</h1>
      </div>

      {/* Main Tabs */}
      <div className="figma-settings-tabs-bar">
        <button
          type="button"
          className={`figma-settings-tab ${activeTab === "roles" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("roles");
            setActiveMenuId(null);
          }}
        >
          Admin Roles
        </button>
        <button
          type="button"
          className={`figma-settings-tab ${activeTab === "suspicious" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("suspicious");
            setActiveMenuId(null);
          }}
        >
          Suspicious Activities
        </button>
        <button
          type="button"
          className={`figma-settings-tab ${activeTab === "audit" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("audit");
            setActiveMenuId(null);
          }}
        >
          Audit Logs
        </button>
      </div>

      {/* Tab 1: Admin Roles */}
      {activeTab === "roles" && (
        <>
          <div className="figma-settings-action-bar">
            <button
              type="button"
              className="figma-settings-add-btn"
              onClick={() => setAddRoleModalOpen(true)}
            >
              Add new admin role
            </button>
          </div>

          <div className="figma-settings-table-card">
            <table className="figma-settings-table">
              <thead>
                <tr>
                  <th>Admin Role</th>
                  <th>No of Team Members</th>
                  <th className="th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id}>
                    <td>
                      <button
                        type="button"
                        className="figma-role-link-btn"
                        onClick={() => {
                          setSelectedRole(role);
                          setRoleDetailTab("team");
                        }}
                      >
                        {role.name}
                      </button>
                    </td>
                    <td>{role.memberCount}</td>
                    <td className="td-actions">
                      <div className="figma-settings-menu-wrapper">
                        <button
                          type="button"
                          className="figma-settings-menu-trigger"
                          aria-label="Actions"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(activeMenuId === role.id ? null : role.id);
                          }}
                        >
                          <EllipsisVertical size={18} />
                        </button>
                        {activeMenuId === role.id && (
                          <div
                            className="figma-settings-dropdown-menu"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null);
                                setSelectedRole(role);
                                setRoleDetailTab("team");
                              }}
                            >
                              View Role
                            </button>
                            <div className="figma-settings-dropdown-divider" />
                            <button
                              type="button"
                              className="danger-item"
                              onClick={() => {
                                setActiveMenuId(null);
                                setRoles((prev) => prev.filter((r) => r.id !== role.id));
                              }}
                            >
                              Delete Role
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {roles.length === 0 && (
                  <tr>
                    <td colSpan={3} className="figma-empty-row">No admin roles created</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Tab 2: Suspicious Activities */}
      {activeTab === "suspicious" && (
        <div className="figma-settings-table-card" style={{ marginTop: "12px" }}>
          <table className="figma-settings-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email Address</th>
                <th>Phone Number</th>
                <th>Unusual Login Attempts</th>
              </tr>
            </thead>
            <tbody>
              {suspiciousList.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.email}</td>
                  <td>{item.phone}</td>
                  <td>{item.attempts}</td>
                </tr>
              ))}
              {suspiciousList.length === 0 && (
                <tr>
                  <td colSpan={4} className="figma-empty-row">No suspicious activities detected</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Audit Logs (Two Stacked Sections) */}
      {activeTab === "audit" && (
        <div className="figma-security-audit-stack">
          {/* Section 1: Admin Logins */}
          <div className="figma-audit-section">
            <h2 className="figma-audit-section-title">Admin Logins</h2>
            <div className="figma-settings-table-card">
              <table className="figma-settings-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Date &amp; Time</th>
                    <th>IP Address</th>
                    <th>Device Info</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {loginsList.map((log) => (
                    <tr key={log.id}>
                      <td>{log.name}</td>
                      <td>{log.dateTime}</td>
                      <td>{log.ipAddress}</td>
                      <td>{log.deviceInfo}</td>
                      <td>{log.location}</td>
                    </tr>
                  ))}
                  {loginsList.length === 0 && (
                    <tr>
                      <td colSpan={5} className="figma-empty-row">No admin logins recorded</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Admin Actions */}
          <div className="figma-audit-section">
            <h2 className="figma-audit-section-title">Admin Actions</h2>
            <div className="figma-settings-table-card">
              <table className="figma-settings-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Date &amp; Time</th>
                    <th>Action Taken</th>
                    <th>Affected Section</th>
                    <th>IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {actionsList.map((act) => (
                    <tr key={act.id}>
                      <td>{act.name}</td>
                      <td>{act.dateTime}</td>
                      <td>{act.actionTaken}</td>
                      <td>{act.affectedSection}</td>
                      <td>{act.ipAddress}</td>
                    </tr>
                  ))}
                  {actionsList.length === 0 && (
                    <tr>
                      <td colSpan={5} className="figma-empty-row">No admin actions recorded</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add new Admin Role */}
      {addRoleModalOpen && (
        <AddAdminRoleModal
          onClose={() => setAddRoleModalOpen(false)}
          onAdd={(roleTitle) => {
            setRoles((prev) => [
              ...prev,
              {
                id: `role-${Date.now()}`,
                name: roleTitle,
                memberCount: 0,
              },
            ]);
            setAddRoleModalOpen(false);
          }}
        />
      )}
    </section>
  );
}

// -------------------------------------------------------------
// Modal: Add new Admin Role
// -------------------------------------------------------------
function AddAdminRoleModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (roleTitle: string) => void;
}) {
  const [roleTitle, setRoleTitle] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleTitle.trim()) return;
    onAdd(roleTitle.trim());
  };

  return (
    <div className="figma-settings-modal-overlay" onClick={onClose}>
      <div className="figma-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="figma-settings-modal-header">
          <h2>Add new Admin Role</h2>
          <button type="button" className="figma-settings-modal-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="figma-settings-modal-form">
          <div className="figma-settings-field">
            <label>Enter Role Title</label>
            <input
              type="text"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder=""
              autoFocus
              required
            />
          </div>

          <div className="figma-settings-modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-save">
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Modal: Add new Team Member
// -------------------------------------------------------------
function AddTeamMemberModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (item: { role: string; name: string; email: string }) => void;
}) {
  const [role, setRole] = useState("Marketing Manager");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    onAdd({ role, name: name.trim(), email: email.trim() });
  };

  return (
    <div className="figma-settings-modal-overlay" onClick={onClose}>
      <div className="figma-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="figma-settings-modal-header">
          <h2>Add new team member</h2>
          <button type="button" className="figma-settings-modal-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="figma-settings-modal-form">
          <div className="figma-settings-field">
            <label>Role</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Marketing Manager"
              required
            />
          </div>

          <div className="figma-settings-field">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              required
              autoFocus
            />
          </div>

          <div className="figma-settings-field">
            <label>Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@email.com"
              required
            />
          </div>

          <div className="figma-settings-modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-save">
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Modal: Add new Permission
// -------------------------------------------------------------
function AddPermissionModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (permName: string) => void;
}) {
  const [permissionName, setPermissionName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissionName.trim()) return;
    onAdd(permissionName.trim());
  };

  return (
    <div className="figma-settings-modal-overlay" onClick={onClose}>
      <div className="figma-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="figma-settings-modal-header">
          <h2>Add new permission</h2>
          <button type="button" className="figma-settings-modal-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="figma-settings-modal-form">
          <div className="figma-settings-field">
            <label>Enter Permission</label>
            <input
              type="text"
              value={permissionName}
              onChange={(e) => setPermissionName(e.target.value)}
              placeholder=""
              autoFocus
              required
            />
          </div>

          <div className="figma-settings-modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-save">
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
