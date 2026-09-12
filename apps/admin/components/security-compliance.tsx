"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, EllipsisVertical, X } from "lucide-react";
import { formatErrorMessage, PERMISSIONS, type AdminRole, type TeamMember, type Permission, type PermissionGrant, type SuspiciousAccount, type AdminLoginRecord, type AdminActionRecord, type PermissionKey } from "@passenger/core";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";

export type SecurityTab = "roles" | "suspicious" | "audit";
export type RoleDetailTab = "team" | "permissions";

type Props = {
  adminRoles: AdminRole[];
  teamMembers: TeamMember[];
  permissions: Permission[];
  permissionGrants: PermissionGrant[];
  suspiciousList: SuspiciousAccount[];
  loginsList: AdminLoginRecord[];
  actionsList: AdminActionRecord[];
  viewerPermissions?: PermissionKey[];
  onCreateRole?: (args: { name: string }) => Promise<unknown>;
  onUpdateRole?: (args: { id: Id<"adminRoles">; name: string }) => Promise<unknown>;
  onDeleteRole?: (args: { id: Id<"adminRoles"> }) => Promise<unknown>;
  onCreateTeamMember?: (args: { adminRoleId: Id<"adminRoles">; name: string; email: string; roleTitle: string }) => Promise<unknown>;
  onInviteTeamMember?: (args: { adminRoleId: Id<"adminRoles">; name: string; email: string; roleTitle: string }) => Promise<{ tempPassword: string; memberId: Id<"teamMembers"> } | undefined>;
  onUpdateTeamMember?: (args: { id: Id<"teamMembers">; adminRoleId: Id<"adminRoles">; name: string; email: string; roleTitle: string }) => Promise<unknown>;
  onDeleteTeamMember?: (args: { id: Id<"teamMembers"> }) => Promise<unknown>;
  onCreatePermission?: (args: { name: string }) => Promise<unknown>;
  onUpdatePermission?: (args: { id: Id<"permissions">; name: string }) => Promise<unknown>;
  onDeletePermission?: (args: { id: Id<"permissions"> }) => Promise<unknown>;
  onSetPermissionGrant?: (args: { permissionId: Id<"permissions">; adminRoleId: Id<"adminRoles">; roleTitle: string; granted: boolean }) => Promise<unknown>;
};

export function SecurityCompliance({
  adminRoles,
  teamMembers,
  permissions,
  permissionGrants,
  suspiciousList,
  loginsList,
  actionsList,
  viewerPermissions = [],
  onCreateRole,
  onUpdateRole,
  onDeleteRole,
  onCreateTeamMember,
  onInviteTeamMember,
  onUpdateTeamMember,
  onDeleteTeamMember,
  onCreatePermission,
  onUpdatePermission,
  onDeletePermission,
  onSetPermissionGrant,
}: Props) {
  const canManage = viewerPermissions.includes(PERMISSIONS.SECURITY_MANAGE);
  const [activeTab, setActiveTab] = useState<SecurityTab>("roles");
  const [selectedRole, setSelectedRole] = useState<AdminRole | null>(null);
  const [roleDetailTab, setRoleDetailTab] = useState<RoleDetailTab>("team");

  const [roles, setRoles] = useState<AdminRole[]>(adminRoles);
  const [members, setMembers] = useState<TeamMember[]>(teamMembers);
  const [perms, setPerms] = useState<Permission[]>(permissions);
  const [grants, setGrants] = useState<PermissionGrant[]>(permissionGrants);
  const [suspicious, setSuspicious] = useState<SuspiciousAccount[]>(suspiciousList);
  const [logins, setLogins] = useState<AdminLoginRecord[]>(loginsList);
  const [actions, setActions] = useState<AdminActionRecord[]>(actionsList);

  useEffect(() => setRoles(adminRoles), [adminRoles]);
  useEffect(() => setMembers(teamMembers), [teamMembers]);
  useEffect(() => setPerms(permissions), [permissions]);
  useEffect(() => setGrants(permissionGrants), [permissionGrants]);
  useEffect(() => setSuspicious(suspiciousList), [suspiciousList]);
  useEffect(() => setLogins(loginsList), [loginsList]);
  useEffect(() => setActions(actionsList), [actionsList]);

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const [roleModal, setRoleModal] = useState<{ open: boolean; editing: AdminRole | null }>({ open: false, editing: null });
  const [teamModal, setTeamModal] = useState<{ open: boolean; editing: TeamMember | null }>({ open: false, editing: null });
  const [permissionModal, setPermissionModal] = useState<{ open: boolean; editing: Permission | null }>({ open: false, editing: null });
  const [isEditingPermissions, setIsEditingPermissions] = useState(false);
  const [grantBusy, setGrantBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    function handleClickOutside() {
      setActiveMenuId(null);
    }
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  const run = async (operation: () => Promise<unknown> | undefined) => {
    setError("");
    try {
      await operation();
      return true;
    } catch (cause) {
      setError(formatErrorMessage(cause, "The server rejected this change."));
      return false;
    }
  };

  if (selectedRole) {
    const roleMembers = members.filter(member => member.adminRoleId === selectedRole.id);
    const columnTitles = [...new Set(roleMembers.map(member => member.roleTitle))];
    const matrixRows = perms.map(permission => ({
      id: permission.id,
      permission: permission.name,
      roles: Object.fromEntries(
        columnTitles.map(title => [
          title,
          !!grants.find(grant => grant.permissionId === permission.id && grant.adminRoleId === selectedRole.id && grant.roleTitle === title && grant.granted),
        ]),
      ),
    }));

    const handleTogglePermission = async (permissionId: string, roleTitle: string) => {
      const existing = grants.find(grant => grant.permissionId === permissionId && grant.adminRoleId === selectedRole.id && grant.roleTitle === roleTitle);
      const granted = !(existing?.granted ?? false);
      const key = `${permissionId}|${roleTitle}`;
      setGrantBusy(key);
      const ok = await run(() => onSetPermissionGrant?.({ permissionId: permissionId as Id<"permissions">, adminRoleId: selectedRole.id as Id<"adminRoles">, roleTitle, granted }));
      if (ok) {
        setGrants(prev =>
          existing
            ? prev.map(grant => (grant.id === existing.id ? { ...grant, granted } : grant))
            : [...prev, { id: `grant-${Date.now()}`, permissionId, adminRoleId: selectedRole.id, roleTitle, granted }],
        );
      }
      setGrantBusy(null);
    };

    return (
      <section className="figma-security-page">
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

        {roleDetailTab === "team" && (
          <>
            <div className="figma-settings-action-bar">
              {canManage && (
                <button
                  type="button"
                  className="figma-settings-add-btn"
                  onClick={() => setTeamModal({ open: true, editing: null })}
                >
                  Add new team member
                </button>
              )}
              {error && <p role="alert" className="error-message">{error}</p>}
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
                  {roleMembers.map(member => (
                    <tr key={member.id}>
                      <td>{member.roleTitle}</td>
                      <td>{member.name}</td>
                      <td>{member.email}</td>
                      <td className="td-actions">
                        <div className="figma-settings-menu-wrapper">
                          {canManage && (
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
                          )}
                          {activeMenuId === member.id && (
                            <div
                              className="figma-settings-dropdown-menu"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuId(null);
                                  setTeamModal({ open: true, editing: member });
                                }}
                              >
                                Edit Member
                              </button>
                              <div className="figma-settings-dropdown-divider" />
                              <button
                                type="button"
                                className="danger-item"
                                onClick={async () => {
                                  setActiveMenuId(null);
                                  const ok = await run(() => onDeleteTeamMember?.({ id: member.id as Id<"teamMembers"> }));
                                  if (ok) setMembers(prev => prev.filter(m => m.id !== member.id));
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
                  {roleMembers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="figma-empty-row">No team members assigned</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {roleDetailTab === "permissions" && (
          <>
            <div className="figma-settings-action-bar figma-permissions-action-bar">
              {canManage && (
                <button
                  type="button"
                  className={`btn-cancel figma-permissions-edit-btn ${isEditingPermissions ? "editing" : ""}`}
                  onClick={() => setIsEditingPermissions(!isEditingPermissions)}
                >
                  {isEditingPermissions ? "Done Editing" : "Edit Permissions"}
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  className="figma-settings-add-btn"
                  onClick={() => setPermissionModal({ open: true, editing: null })}
                >
                  Add Permissions
                </button>
              )}
              {error && <p role="alert" className="error-message">{error}</p>}
            </div>

            <div className="figma-settings-table-card">
              {columnTitles.length === 0 ? (
                <div className="figma-empty-row">Add team members to configure their permissions</div>
              ) : (
                <table className="figma-settings-table figma-permissions-table">
                  <thead>
                    <tr>
                      <th style={{ width: "40%" }}>Permissions</th>
                      {columnTitles.map(title => (
                        <th key={title} style={{ textAlign: "center", width: "20%" }}>
                          {title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixRows.map(row => (
                      <tr key={row.id}>
                        <td>
                          <div className="figma-permission-cell">
                            <span>{row.permission}</span>
                            <div className="figma-settings-menu-wrapper">
                              {canManage && (
                                <button
                                  type="button"
                                  className="figma-settings-menu-trigger"
                                  aria-label="Permission actions"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(activeMenuId === row.id ? null : row.id);
                                  }}
                                >
                                  <EllipsisVertical size={15} />
                                </button>
                              )}
                              {activeMenuId === row.id && (
                                <div
                                  className="figma-settings-dropdown-menu"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveMenuId(null);
                                      setPermissionModal({ open: true, editing: perms.find(p => p.id === row.id) ?? null });
                                    }}
                                  >
                                    Rename Permission
                                  </button>
                                  <div className="figma-settings-dropdown-divider" />
                                  <button
                                    type="button"
                                    className="danger-item"
                                    onClick={async () => {
                                      setActiveMenuId(null);
                                      const ok = await run(() => onDeletePermission?.({ id: row.id as Id<"permissions"> }));
                                      if (ok) {
                                        setPerms(prev => prev.filter(p => p.id !== row.id));
                                        setGrants(prev => prev.filter(g => g.permissionId !== row.id));
                                      }
                                    }}
                                  >
                                    Delete Permission
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        {columnTitles.map(title => {
                          const isChecked = !!row.roles[title];
                          const busy = grantBusy === `${row.id}|${title}`;
                          return (
                            <td key={title} style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                className={`figma-matrix-checkbox ${isChecked ? "checked" : ""}`}
                                disabled={!!grantBusy || !canManage}
                                onClick={() => handleTogglePermission(row.id, title)}
                                aria-label={`${row.permission} for ${title}`}
                              >
                                {busy ? <span className="figma-matrix-spinner" aria-hidden="true" /> : isChecked && <Check size={14} strokeWidth={3} />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {matrixRows.length === 0 && (
                      <tr>
                        <td colSpan={columnTitles.length + 1} className="figma-empty-row">No permissions configured</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {teamModal.open && (
          <AddTeamMemberModal
            roles={roles}
            initialData={teamModal.editing}
            defaultRoleId={selectedRole.id}
            onClose={() => setTeamModal({ open: false, editing: null })}
            onInvite={onInviteTeamMember}
            onSave={async (item) => {
              if (teamModal.editing) {
                const ok = await run(() => onUpdateTeamMember?.({ id: teamModal.editing!.id as Id<"teamMembers">, ...item }));
                if (ok) {
                  setMembers(prev => prev.map(m => (m.id === teamModal.editing!.id ? { ...m, ...item } : m)));
                  setTeamModal({ open: false, editing: null });
                }
              } else {
                const ok = await run(() => onCreateTeamMember?.(item));
                if (ok) {
                  setMembers(prev => [...prev, { id: `member-${Date.now()}`, ...item }]);
                  setTeamModal({ open: false, editing: null });
                }
              }
            }}
          />
        )}

        {permissionModal.open && (
          <AddPermissionModal
            initialData={permissionModal.editing}
            onClose={() => setPermissionModal({ open: false, editing: null })}
            onSave={async (name) => {
              if (permissionModal.editing) {
                const ok = await run(() => onUpdatePermission?.({ id: permissionModal.editing!.id as Id<"permissions">, name }));
                if (ok) {
                  setPerms(prev => prev.map(p => (p.id === permissionModal.editing!.id ? { ...p, name } : p)));
                  setPermissionModal({ open: false, editing: null });
                }
              } else {
                const ok = await run(() => onCreatePermission?.({ name }));
                if (ok) {
                  setPerms(prev => [...prev, { id: `permission-${Date.now()}`, name }]);
                  setPermissionModal({ open: false, editing: null });
                }
              }
            }}
          />
        )}
      </section>
    );
  }

  return (
    <section className="figma-security-page">
      <div className="figma-settings-header">
        <h1>Security and Compliance</h1>
      </div>

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

      {activeTab === "roles" && (
        <>
          <div className="figma-settings-action-bar">
            {canManage && (
              <button
                type="button"
                className="figma-settings-add-btn"
                onClick={() => setRoleModal({ open: true, editing: null })}
              >
                Add new admin role
              </button>
            )}
            {error && <p role="alert" className="error-message">{error}</p>}
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
                {roles.map(role => (
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
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMenuId(null);
                                  setRoleModal({ open: true, editing: role });
                                }}
                              >
                                Edit Role
                              </button>
                            )}
                            {canManage && (
                              <>
                                <div className="figma-settings-dropdown-divider" />
                                <button
                                  type="button"
                                  className="danger-item"
                                  onClick={async () => {
                                    setActiveMenuId(null);
                                    const ok = await run(() => onDeleteRole?.({ id: role.id as Id<"adminRoles"> }));
                                    if (ok) setRoles(prev => prev.filter(r => r.id !== role.id));
                                  }}
                                >
                                  Delete Role
                                </button>
                              </>
                            )}
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
              {suspicious.map(item => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.email ?? "-"}</td>
                  <td>{item.phone ?? "-"}</td>
                  <td>{item.attempts}</td>
                </tr>
              ))}
              {suspicious.length === 0 && (
                <tr>
                  <td colSpan={4} className="figma-empty-row">No suspicious activities detected</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "audit" && (
        <div className="figma-security-audit-stack">
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
                  {logins.map(log => (
                    <tr key={log.id}>
                      <td>{log.name}</td>
                      <td>{log.dateTime}</td>
                      <td>{log.ipAddress ?? "-"}</td>
                      <td>{log.deviceInfo ?? "-"}</td>
                      <td>{log.location ?? "-"}</td>
                    </tr>
                  ))}
                  {logins.length === 0 && (
                    <tr>
                      <td colSpan={5} className="figma-empty-row">No admin logins recorded</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

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
                  {actions.map(act => (
                    <tr key={act.id}>
                      <td>{act.name}</td>
                      <td>{act.dateTime}</td>
                      <td>{act.actionTaken}</td>
                      <td>{act.affectedSection ?? "-"}</td>
                      <td>{act.ipAddress ?? "-"}</td>
                    </tr>
                  ))}
                  {actions.length === 0 && (
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

      {roleModal.open && (
        <AddAdminRoleModal
          initialData={roleModal.editing}
          onClose={() => setRoleModal({ open: false, editing: null })}
          onSave={async (name) => {
            if (roleModal.editing) {
              const ok = await run(() => onUpdateRole?.({ id: roleModal.editing!.id as Id<"adminRoles">, name }));
              if (ok) {
                setRoles(prev => prev.map(r => (r.id === roleModal.editing!.id ? { ...r, name } : r)));
                setRoleModal({ open: false, editing: null });
              }
            } else {
              const ok = await run(() => onCreateRole?.({ name }));
              if (ok) {
                setRoles(prev => [...prev, { id: `role-${Date.now()}`, name, memberCount: 0 }]);
                setRoleModal({ open: false, editing: null });
              }
            }
          }}
        />
      )}
    </section>
  );
}

// -------------------------------------------------------------
// Modal: Add / Edit Admin Role
// -------------------------------------------------------------
function AddAdminRoleModal({
  initialData,
  onClose,
  onSave,
}: {
  initialData: AdminRole | null;
  onClose: () => void;
  onSave: (roleTitle: string) => Promise<void>;
}) {
  const [roleTitle, setRoleTitle] = useState(initialData?.name ?? "");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleTitle.trim() || busy) return;
    setBusy(true);
    try {
      await onSave(roleTitle.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="figma-settings-modal-overlay" onClick={onClose}>
      <div className="figma-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="figma-settings-modal-header">
          <h2>{initialData ? "Edit Admin Role" : "Add new Admin Role"}</h2>
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
            <button type="submit" className="btn-save" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Modal: Add / Edit Team Member
// -------------------------------------------------------------
function AddTeamMemberModal({
  roles,
  initialData,
  defaultRoleId,
  onClose,
  onInvite,
  onSave,
}: {
  roles: AdminRole[];
  initialData: TeamMember | null;
  defaultRoleId: string;
  onClose: () => void;
  onInvite?: (args: { adminRoleId: Id<"adminRoles">; name: string; email: string; roleTitle: string }) => Promise<{ tempPassword: string; memberId: Id<"teamMembers"> } | undefined>;
  onSave: (item: { adminRoleId: Id<"adminRoles">; name: string; email: string; roleTitle: string }) => Promise<void>;
}) {
  const [adminRoleId, setAdminRoleId] = useState<string>(initialData?.adminRoleId ?? defaultRoleId);
  const [roleTitle, setRoleTitle] = useState(initialData?.roleTitle ?? "");
  const [name, setName] = useState(initialData?.name ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [generatePassword, setGeneratePassword] = useState(!initialData);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [availableRoles, setAvailableRoles] = useState<AdminRole[]>(roles.length ? roles : [{ id: defaultRoleId, name: "Default", memberCount: 0 }]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !roleTitle.trim() || busy) return;
    if (!adminRoleId) {
      setError("Select an admin role first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (generatePassword && !initialData && onInvite) {
        const result = await onInvite({ adminRoleId: adminRoleId as Id<"adminRoles">, name: name.trim(), email: email.trim(), roleTitle: roleTitle.trim() });
        if (result) setTempPassword(result.tempPassword);
      } else {
        await onSave({ adminRoleId: adminRoleId as Id<"adminRoles">, name: name.trim(), email: email.trim(), roleTitle: roleTitle.trim() });
        onClose();
      }
    } catch (cause) {
      setError(formatErrorMessage(cause, "The server rejected this change."));
    } finally {
      setBusy(false);
    }
  };

  const copyPassword = async () => {
    if (!tempPassword) return;
    try { await navigator.clipboard.writeText(tempPassword); } catch { /* best effort */ }
  };

  if (tempPassword) {
    return (
      <div className="figma-settings-modal-overlay">
        <div className="figma-settings-modal" onClick={(e) => e.stopPropagation()}>
          <div className="figma-settings-modal-header">
            <h2>Invitation ready</h2>
            <button type="button" className="figma-settings-modal-close" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>
          <div className="figma-settings-modal-form">
            <p className="figma-invite-note">Share a one-time temporary password with <strong>{name.trim()}</strong>. They will be asked to change it the first time they sign in.</p>
            <div className="figma-settings-field">
              <label>Temp password</label>
              <div className="figma-invite-password-row">
                <code className="figma-invite-password">{tempPassword}</code>
                <button type="button" className="btn-cancel" onClick={() => void copyPassword()}>Copy</button>
              </div>
            </div>
            <div className="figma-settings-modal-actions">
              <button type="button" className="btn-save" onClick={onClose}>Done</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="figma-settings-modal-overlay" onClick={onClose}>
      <div className="figma-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="figma-settings-modal-header">
          <h2>{initialData ? "Edit team member" : "Add new team member"}</h2>
          <button type="button" className="figma-settings-modal-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="figma-settings-modal-form">
          <div className="figma-settings-field">
            <label>Admin role</label>
            <select value={adminRoleId} onChange={(e) => setAdminRoleId(e.target.value)} required>
              {availableRoles.map(role => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>

          <div className="figma-settings-field">
            <label>Role title</label>
            <input
              type="text"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
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

          {!initialData && (
            <label className="figma-invite-toggle">
              <input
                type="checkbox"
                checked={generatePassword}
                onChange={(e) => setGeneratePassword(e.target.checked)}
              />
              <span>Generate a temporary password — they’ll be required to change it after their first sign in.</span>
            </label>
          )}

          {error && <p role="alert" className="error-message">{error}</p>}

          <div className="figma-settings-modal-actions">
            <button type="submit" className="btn-save" disabled={busy}>
              {busy ? "Saving…" : initialData ? "Save" : generatePassword ? "Invite member" : "Add member"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Modal: Add / Rename Permission
// -------------------------------------------------------------
function AddPermissionModal({
  initialData,
  onClose,
  onSave,
}: {
  initialData: Permission | null;
  onClose: () => void;
  onSave: (permissionName: string) => Promise<void>;
}) {
  const [permissionName, setPermissionName] = useState(initialData?.name ?? "");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissionName.trim() || busy) return;
    setBusy(true);
    try {
      await onSave(permissionName.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="figma-settings-modal-overlay" onClick={onClose}>
      <div className="figma-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="figma-settings-modal-header">
          <h2>{initialData ? "Rename permission" : "Add new permission"}</h2>
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
            <button type="submit" className="btn-save" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
