"use client";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import { ConvexReactClient, useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@passenger/backend/convex/_generated/api";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import type { DashboardSnapshot } from "@passenger/core";
import { Eye, EyeOff, LoaderCircle, ShieldCheck, Waypoints } from "lucide-react";
import { Dashboard, type AdminAction } from "./dashboard";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim() ?? "";
function validUrl(value: string) { try { return ["https:", "http:"].includes(new URL(value).protocol); } catch { return false; } }
const configured = validUrl(convexUrl);
const convex = configured ? new ConvexReactClient(convexUrl) : null;

export function Brand() { return <div className="brand"><span className="brand-mark"><Waypoints size={23} strokeWidth={2.5} /></span><span>passenger<span className="brand-dot">.</span></span></div>; }
export function Gate({ title, children, loading = false }: { title: string; children: ReactNode; loading?: boolean }) { return <main className="gate" aria-busy={loading}><Brand /><section className="gate-card"><div className="gate-icon">{loading ? <LoaderCircle className="spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}</div><p className="eyebrow">TRUST & SAFETY WORKSPACE</p><h1>{title}</h1>{children}</section><small>Good things move with people.</small></main>; }
function ForcePasswordChange({ onChangePassword }: { onChangePassword: (args: { currentPassword: string; newPassword: string }) => Promise<unknown> }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (next.length < 10 || !/[a-z]/.test(next) || !/[A-Z]/.test(next) || !/\d/.test(next)) throw new Error("Use at least 10 characters with uppercase, lowercase, and a number.");
      if (next !== confirm) throw new Error("Passwords do not match.");
      if (next === current) throw new Error("Choose a password different from your temporary one.");
      await onChangePassword({ currentPassword: current, newPassword: next });
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not update your password.");
    } finally {
      setBusy(false);
    }
  };
  if (done) return <Gate title="Password updated" loading><p role="status">Opening your workspace…</p></Gate>;
  return <Gate title="Set a new password"><p>Before you continue, choose a secure password. Your administrator assigned a temporary one-time password.</p>
    <form className="form-stack" aria-busy={busy} onSubmit={submit}>
      <label>Temporary password<span className="auth-input-wrap"><input required minLength={10} disabled={busy} autoComplete="current-password" type={show ? "text" : "password"} value={current} onChange={e => setCurrent(e.target.value)} /><button type="button" className="auth-icon-button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(value => !value)}>{show ? <EyeOff size={20} /> : <Eye size={20} />}</button></span></label>
      <label>New password<span className="auth-input-wrap"><input required minLength={10} disabled={busy} autoComplete="new-password" type={show ? "text" : "password"} value={next} onChange={e => setNext(e.target.value)} /><button type="button" className="auth-icon-button auth-icon-button-placeholder" aria-hidden="true" tabIndex={-1}><Eye size={20} /></button></span></label>
      <label>Confirm new password<span className="auth-input-wrap"><input required minLength={10} disabled={busy} autoComplete="new-password" type={show ? "text" : "password"} value={confirm} onChange={e => setConfirm(e.target.value)} /><button type="button" className="auth-icon-button auth-icon-button-placeholder" aria-hidden="true" tabIndex={-1}><Eye size={20} /></button></span></label>
      <div className="notice">Use at least 10 characters with uppercase, lowercase, and a number.</div>
      {error && <p role="alert" className="error-message">{error}</p>}
      <button className="button primary" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
    </form>
    <SignOutButton /></Gate>;
}
class LiveBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) { return { error: error.message || "The workspace could not be loaded." }; }
  render() { if (this.state.error) return <Gate title="We couldn’t load your workspace"><p>Check your connection and administrator permissions. No operational action has been confirmed.</p><div role="alert" className="error-message">{this.state.error}</div><button className="button primary" onClick={() => window.location.reload()}>Retry connection</button></Gate>; return this.props.children; }
}
export function AdminRoot() {
  if (!configured || !convex) return <Gate title="Connect your operations workspace"><p>Passenger requires the shared backend URL. No records are available until setup is complete.</p><ol className="setup-list"><li>Set <code>NEXT_PUBLIC_CONVEX_URL</code> to your deployment URL.</li><li>Restart or rebuild the application.</li></ol><div className="notice">Authentication runs inside Passenger's Convex backend. Administrator access is controlled by the server-side email allowlist.</div></Gate>;
  return <LiveBoundary><ConvexAuthProvider client={convex}><LiveWorkspace /></ConvexAuthProvider></LiveBoundary>;
}
function LiveWorkspace() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [offline, setOffline] = useState(false);
  useEffect(() => { const sync = () => setOffline(!navigator.onLine); sync(); window.addEventListener("online", sync); window.addEventListener("offline", sync); return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); }; }, []);
  if (offline) return <Gate title="You’re offline"><p>Operations are paused while your device is offline. Reconnect to view current records and safely resume work.</p><button className="button primary" onClick={() => window.location.reload()}>Retry connection</button></Gate>;
  if (isLoading) return <Gate title="Connecting securely" loading><p role="status">Authorizing your Convex session…</p></Gate>;
  if (!isAuthenticated) return <AuthForm />;
  return <AuthenticatedWorkspace />;
}
function AuthForm() {
  const { signIn } = useAuthActions();
  const [screen, setScreen] = useState<"signIn" | "forgot" | "sent" | "reset">("signIn");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("reset_code");
    const resetEmail = params.get("reset_email");
    if (!code || !resetEmail) return;
    setResetCode(code);
    setEmail(resetEmail);
    setScreen("reset");
  }, []);

  const submitSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn("password", { flow: "signIn", email: email.trim().toLowerCase(), password });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  const requestReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendReset();
  };

  const sendReset = async () => {
    setBusy(true);
    setError("");
    try {
      await signIn("password", { flow: "reset", email: email.trim().toLowerCase() });
      setScreen("sent");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not send a reset email.");
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!resetCode.trim()) throw new Error("Open the reset link from your email or paste the reset code.");
      if (newPassword.length < 10 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
        throw new Error("Use at least 10 characters with uppercase, lowercase, and a number.");
      }
      if (newPassword !== confirmPassword) throw new Error("Passwords do not match.");
      await signIn("password", { flow: "reset-verification", email: email.trim().toLowerCase(), code: resetCode.trim(), newPassword });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not reset your password.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-screen"><div className="auth-frame"><div className="auth-logo">PASSENGER</div><section className="auth-panel">
    {screen === "signIn" && <><div className="auth-copy"><h1>Sign in</h1><p>Please enter your information below</p></div><form className="auth-form" aria-busy={busy} onSubmit={submitSignIn}>
      <label className="auth-field"><span>Email Address</span><input required type="email" disabled={busy} autoComplete="email" placeholder="johndoe@gmail.com" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label className="auth-field"><span>Password</span><span className="auth-input-wrap"><input required minLength={10} disabled={busy} autoComplete="current-password" type={showPassword ? "text" : "password"} placeholder="*****************" value={password} onChange={e => setPassword(e.target.value)} /><button type="button" className="auth-icon-button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></span></label>
      <div className="auth-row"><label className="auth-check"><input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} /><span>Remember me</span></label><button type="button" className="auth-link" onClick={() => { setError(""); setScreen("forgot"); }}>Forgot your password?</button></div>
      {error && <p role="alert" className="error-message">{error}</p>}
      <button className="button primary auth-submit" disabled={busy}>{busy ? "Signing in..." : "Sign In"}</button>
    </form></>}
    {screen === "forgot" && <><div className="auth-copy"><h1>Forgot Password?</h1><p>Enter your email address</p></div><form className="auth-form" aria-busy={busy} onSubmit={requestReset}>
      <label className="auth-field"><span>Email Address</span><input required type="email" disabled={busy} autoComplete="email" placeholder="johndoe@gmail.com" value={email} onChange={e => setEmail(e.target.value)} /></label>
      {error && <p role="alert" className="error-message">{error}</p>}
      <button className="button primary auth-submit" disabled={busy}>{busy ? "Sending..." : "Send reset email"}</button>
    </form></>}
    {screen === "sent" && <><div className="auth-copy"><h1>Forgot Password?</h1><p>We’ve sent you an email to {email.trim() || "your inbox"}. Please check your inbox and follow instructions to reset your password.</p></div>{error && <p role="alert" className="error-message">{error}</p>}<button type="button" className="auth-link auth-link-center" onClick={() => void sendReset()}>Didn’t receive an email? Send again</button></>}
    {screen === "reset" && <><div className="auth-copy"><h1>Reset your Password</h1><p>Enter your new password</p></div><form className="auth-form" aria-busy={busy} onSubmit={submitReset}>
      <label className="auth-field"><span>Email Address</span><input required type="email" disabled={busy} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      {!resetCode && <label className="auth-field"><span>Reset Code</span><input required disabled={busy} value={resetCode} onChange={e => setResetCode(e.target.value)} /></label>}
      <label className="auth-field"><span>Password</span><span className="auth-input-wrap"><input required minLength={10} disabled={busy} autoComplete="new-password" type={showResetPassword ? "text" : "password"} placeholder="************" value={newPassword} onChange={e => setNewPassword(e.target.value)} /><button type="button" className="auth-icon-button" aria-label={showResetPassword ? "Hide password" : "Show password"} onClick={() => setShowResetPassword(value => !value)}>{showResetPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></span></label>
      <label className="auth-field"><span>Confirm Password</span><span className="auth-input-wrap"><input required minLength={10} disabled={busy} autoComplete="new-password" type={showResetPassword ? "text" : "password"} placeholder="************" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /><button type="button" className="auth-icon-button auth-icon-button-placeholder" aria-hidden="true" tabIndex={-1}><Eye size={20} /></button></span></label>
      {error && <p role="alert" className="error-message">{error}</p>}
      <button className="button primary auth-submit" disabled={busy}>{busy ? "Resetting..." : "Reset password"}</button>
    </form></>}
  </section></div></main>;
}
function SignOutButton() { const { signOut }=useAuthActions(); return <button className="button" onClick={() => void signOut()}>Sign out</button>; }
function AuthenticatedWorkspace() {
  const snapshot = useQuery(api.marketplace.dashboard, {}) as DashboardSnapshot | undefined;
  const reviewUser = useMutation(api.admin.reviewUser);
  const reviewShipment = useMutation(api.admin.reviewShipment);
  const resolveDispute = useMutation(api.admin.resolveDispute);
  const recordPayout = useMutation(api.admin.recordPayout);
  const createChat = useMutation(api.support.createChat);
  const sendMessage = useMutation(api.support.sendMessage);
  const markResolved = useMutation(api.support.markResolved);
  const reopenChat = useMutation(api.support.reopenChat);
  const qaReview = useMutation(api.support.qaReview);
  const claimView = useMutation(api.support.claimView);
  const releaseView = useMutation(api.support.releaseView);
  const handover = useMutation(api.support.handover);
  const createFaq = useMutation(api.faqs.create);
  const updateFaq = useMutation(api.faqs.update);
  const deleteFaq = useMutation(api.faqs.remove);
  const createSetting = useMutation(api.settings.create);
  const updateSetting = useMutation(api.settings.update);
  const deleteSetting = useMutation(api.settings.remove);
  const updateFeeConfig = useMutation(api.settings.updateFeeConfig);
  const createEscrow = useMutation(api.escrowPolicies.create);
  const updateEscrow = useMutation(api.escrowPolicies.update);
  const deleteEscrow = useMutation(api.escrowPolicies.remove);
  const createCancellation = useMutation(api.cancellationPolicies.create);
  const updateCancellation = useMutation(api.cancellationPolicies.update);
  const deleteCancellation = useMutation(api.cancellationPolicies.remove);
  const createKycTier = useMutation(api.kycTiers.create);
  const updateKycTier = useMutation(api.kycTiers.update);
  const deleteKycTier = useMutation(api.kycTiers.remove);
  const updateUserTier = useMutation(api.admin.updateUserTier);
  const updateServiceArea = useMutation(api.serviceArea.update);
  const createAdminRole = useMutation(api.security.createRole);
  const updateAdminRole = useMutation(api.security.updateRole);
  const deleteAdminRole = useMutation(api.security.removeRole);
  const createTeamMember = useMutation(api.security.createTeamMember);
  const updateTeamMember = useMutation(api.security.updateTeamMember);
  const deleteTeamMember = useMutation(api.security.removeTeamMember);
  const createPermission = useMutation(api.security.createPermission);
  const updatePermission = useMutation(api.security.updatePermission);
  const deletePermission = useMutation(api.security.removePermission);
  const setPermissionGrant = useMutation(api.security.setPermissionGrant);
  const inviteTeamMember = useAction(api.security.inviteTeamMember);
  const changeOwnPassword = useAction(api.security.setOwnPassword);
  const ensureSeed = useMutation(api.security.ensureSeed);
  const recordStaffLogin = useMutation(api.security.recordStaffLogin);
  const bootLoginRecorded = useRef(false);
  useEffect(() => {
    if (bootLoginRecorded.current || !snapshot || !snapshot.viewer) return;
    if (snapshot.viewer.role !== "admin" && snapshot.viewer.role !== "compliance") return;
    bootLoginRecorded.current = true;
    void ensureSeed().catch(() => {});
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);
    (async () => {
      let ipAddress: string | null = null;
      try {
        const response = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
        const data = (await response.json()) as { ip?: string };
        ipAddress = typeof data.ip === "string" ? data.ip : null;
      } catch { /* best effort */ }
      window.clearTimeout(timeout);
      try {
        await recordStaffLogin({ deviceInfo: deviceLabel(navigator.userAgent), ...(ipAddress ? { ipAddress } : {}) });
      } catch { /* best effort */ }
    })();
  }, [snapshot, ensureSeed, recordStaffLogin]);
  if (snapshot === undefined) return <Gate title="Getting everything in order" loading><p role="status">Loading live deliveries and trust reviews…</p></Gate>;
  if (!snapshot.viewer) return <ProfileSetup />;
  if (snapshot.viewer.role !== "admin" && snapshot.viewer.role !== "compliance") return <Gate title="An admin seat is required"><p>You’re signed in as <strong>{snapshot.viewer.name}</strong>. This workspace is restricted to Passenger administrators and compliance officers. Ask your system administrator to add your email to <code>ADMIN_USER_EMAILS</code>.</p><div className="notice">Your account does not have access to operational or financial actions.</div><SignOutButton /></Gate>;
  if (snapshot.viewer.mustChangePassword) return <ForcePasswordChange onChangePassword={changeOwnPassword} />;
  async function act(action: AdminAction) {
    if (action.type === "user") await reviewUser({ userId: action.id as Id<"users">, decision: action.decision, tier: action.tier, note: action.note });
    else if (action.type === "review") await reviewShipment({ shipmentId: action.id as Id<"shipments">, decision: action.decision, note: action.note });
    else if (action.type === "dispute") await resolveDispute({ disputeId: action.id as Id<"disputes">, resolution: action.resolution, note: action.note, externalReference: action.externalReference });
    else await recordPayout({ shipmentId: action.id as Id<"shipments">, externalReference: action.externalReference, note: action.note });
  }
  return <Dashboard snapshot={snapshot} onAction={act} accountControl={<SignOutButton />} onCreateChat={createChat} onSendMessage={sendMessage} onCreateFaq={createFaq} onUpdateFaq={updateFaq} onDeleteFaq={deleteFaq} onMarkResolved={markResolved} onReopenChat={reopenChat} onQaReview={qaReview} onClaimView={claimView} onReleaseView={releaseView} onHandover={handover} onCreateSetting={createSetting} onUpdateSetting={updateSetting} onDeleteSetting={deleteSetting} onUpdateFeeConfig={updateFeeConfig} onCreateEscrow={createEscrow} onUpdateEscrow={updateEscrow} onDeleteEscrow={deleteEscrow} onCreateCancellation={createCancellation} onUpdateCancellation={updateCancellation} onDeleteCancellation={deleteCancellation} onCreateKycTier={createKycTier} onUpdateKycTier={updateKycTier} onDeleteKycTier={deleteKycTier} onUpdateTier={updateUserTier} onUpdateServiceArea={updateServiceArea} onCreateAdminRole={createAdminRole} onUpdateAdminRole={updateAdminRole} onDeleteAdminRole={deleteAdminRole} onCreateTeamMember={createTeamMember} onInviteTeamMember={inviteTeamMember} onUpdateTeamMember={updateTeamMember} onDeleteTeamMember={deleteTeamMember} onCreatePermission={createPermission} onUpdatePermission={updatePermission} onDeletePermission={deletePermission} onSetPermissionGrant={setPermissionGrant} />;
}
function deviceLabel(ua: string) {
  const browser = /Edg\//i.test(ua) ? "Edge" : /OPR\//i.test(ua) || /Opera/i.test(ua) ? "Opera" : /Chrome/i.test(ua) ? "Chrome" : /Safari/i.test(ua) ? "Safari" : /Firefox/i.test(ua) ? "Firefox" : "Browser";
  const os = /Windows/i.test(ua) ? "Windows" : /Mac OS X|Macintosh/i.test(ua) ? "macOS" : /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Linux/i.test(ua) ? "Linux" : "Web";
  return `${browser}, ${os}`;
}
function ProfileSetup() {
  const ensureProfile = useMutation(api.accounts.ensureProfile);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Gate title="Complete your account"><p>Create your Passenger profile. This does not grant administrator access.</p><form className="form-stack" aria-busy={busy} onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { await ensureProfile({ name: name.trim(), phone: phone.trim() }); } catch (e) { setError(e instanceof Error ? e.message : "Profile creation failed."); } finally { setBusy(false); } }}><label>Full name<input required maxLength={120} disabled={busy} value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label><label>Phone number<input required type="tel" minLength={10} maxLength={20} disabled={busy} value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" /></label>{error && <p role="alert" className="error-message">{error}</p>}<button className="button primary" disabled={busy}>{busy ? "Creating profile…" : "Create profile"}</button></form><SignOutButton /></Gate>;
}
