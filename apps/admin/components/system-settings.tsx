"use client";

import { useState, useEffect } from "react";
import { ChevronDown, EllipsisVertical, X } from "lucide-react";
import type { SystemSetting, FeeConfig, EscrowPolicy, CancellationPolicy, KycTier, ServiceAreaConfig, MobileProductConfig } from "@passenger/core";
import { formatErrorMessage } from "@passenger/core";
import type { Id } from "@passenger/backend/convex/_generated/dataModel";
import { api } from "@passenger/backend/convex/_generated/api";
import { useMutation } from "convex/react";

import { PromotionsManagement } from "./promotions-management";

type SettingsTab = "promotions" | "fees" | "mobile" | "escrow" | "serviceArea" | "cancellation" | "kyc" | "terms" | "privacy";

interface Props {
  settings: SystemSetting[];
  feeConfig?: FeeConfig;
  escrowPolicies: EscrowPolicy[];
  cancellationPolicies: CancellationPolicy[];
  kycTiers: KycTier[];
  serviceArea?: ServiceAreaConfig;
  mobileConfig?: MobileProductConfig;
  onCreateSetting?: (args: { key: string; title: string; body: string }) => Promise<unknown>;
  onUpdateSetting?: (args: { id: Id<"settings">; title: string; body: string }) => Promise<unknown>;
  onDeleteSetting?: (args: { id: Id<"settings"> }) => Promise<unknown>;
  onUpdateFeeConfig?: (args: { platformFeePercent: number; baseFeeNaira: number; distanceRateNairaPerKm: number; minFeeNaira: number; categoryMultipliers?: Record<string, number>; weightMultipliers?: { minKg: number; maxKg: number; multiplier: number }[] }) => Promise<unknown>;
  onCreateEscrow?: (args: { policyName: string; type: string; releaseTime: string }) => Promise<unknown>;
  onUpdateEscrow?: (args: { id: Id<"escrowPolicies">; policyName: string; type: string; releaseTime: string }) => Promise<unknown>;
  onDeleteEscrow?: (args: { id: Id<"escrowPolicies"> }) => Promise<unknown>;
  onCreateCancellation?: (args: { ruleName: string; refundType: string; refundPercent: number; window: string }) => Promise<unknown>;
  onUpdateCancellation?: (args: { id: Id<"cancellationPolicies">; ruleName: string; refundType: string; refundPercent: number; window: string }) => Promise<unknown>;
  onDeleteCancellation?: (args: { id: Id<"cancellationPolicies"> }) => Promise<unknown>;
  onCreateKycTier?: (args: { tierName: string; requirements: string[]; maxShipmentValueNaira: number; maxCapacityKg?: number; description?: string }) => Promise<unknown>;
  onUpdateKycTier?: (args: { id: Id<"kycTiers">; tierName: string; requirements: string[]; maxShipmentValueNaira: number; maxCapacityKg?: number; description?: string }) => Promise<unknown>;
  onDeleteKycTier?: (args: { id: Id<"kycTiers"> }) => Promise<unknown>;
  onUpdateServiceArea?: (args: { baseLocation: string; destinations: string[] }) => Promise<unknown>;
}

function parseSettingItem(s: SystemSetting) {
  const lines = s.body.split("\n").map((l) => l.replace(/^•\s*/, "").trim()).filter(Boolean);
  const versionLine = lines.find((l) => l.toLowerCase().startsWith("version:"));
  const version = versionLine ? versionLine.replace(/^version:\s*/i, "").trim() : "V1.0";
  const statusLine = lines.find((l) => l.toLowerCase().startsWith("status:"));
  const status = statusLine ? (statusLine.replace(/^status:\s*/i, "").trim() as "Draft" | "Published") : "Draft";
  const contentLines = lines.filter((l) => !l.toLowerCase().startsWith("version:") && !l.toLowerCase().startsWith("status:"));
  return { id: s.id, key: s.key, title: s.title, version, status, content: contentLines.map((l) => `• ${l}`).join("\n"), lastUpdated: new Date(s.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) };
}

function buildSettingBody(version: string, status: string, content: string) {
  return `Version: ${version}\nStatus: ${status}\n${content}`;
}

export function SystemSettings({ settings, feeConfig, escrowPolicies, cancellationPolicies, kycTiers, serviceArea, mobileConfig, onCreateSetting, onUpdateSetting, onDeleteSetting, onUpdateFeeConfig, onCreateEscrow, onUpdateEscrow, onDeleteEscrow, onCreateCancellation, onUpdateCancellation, onDeleteCancellation, onCreateKycTier, onUpdateKycTier, onDeleteKycTier, onUpdateServiceArea }: Props) {
  const updateMobileConfig = useMutation(api.settings.updateMobileProductConfig);
  const [activeTab, setActiveTab] = useState<SettingsTab>("fees");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  const termsItems = settings.filter((s) => s.key.startsWith("terms_")).map(parseSettingItem);
  const privacyItems = settings.filter((s) => s.key.startsWith("privacy_")).map(parseSettingItem);

  const [feeModalOpen, setFeeModalOpen] = useState(false);
  const [mobileModalOpen, setMobileModalOpen] = useState(false);
  const [escrowModalOpen, setEscrowModalOpen] = useState(false);
  const [editingEscrow, setEditingEscrow] = useState<{ id: string; policyName: string; type: string; releaseTime: string } | null>(null);
  const [saBase, setSaBase] = useState(serviceArea?.baseLocation ?? "Jos");
  const [saDests, setSaDests] = useState<string[]>(() => {
    const base = (serviceArea?.baseLocation ?? "Jos").toLowerCase();
    return (serviceArea?.destinations ?? []).filter((d) => d.trim().toLowerCase() !== base);
  });
  const [saModalOpen, setSaModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [editingCancel, setEditingCancel] = useState<{ id: string; ruleName: string; refundType: string; refundPercent: number; window: string } | null>(null);
  const [kycModalOpen, setKycModalOpen] = useState(false);
  const [editingKyc, setEditingKyc] = useState<{ id: string; tierName: string; requirements: string[]; maxShipmentValueNaira: number; maxCapacityKg?: number; description?: string } | null>(null);

  const [termModalOpen, setTermModalOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<{ id: string; key: string; title: string; version: string; status: "Draft" | "Published"; content: string } | null>(null);
  const [viewingTerm, setViewingTerm] = useState<{ id: string; key: string; title: string; version: string; status: "Draft" | "Published"; content: string } | null>(null);

  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [editingPrivacy, setEditingPrivacy] = useState<{ id: string; key: string; title: string; version: string; status: "Draft" | "Published"; content: string } | null>(null);
  const [viewingPrivacy, setViewingPrivacy] = useState<{ id: string; key: string; title: string; version: string; status: "Draft" | "Published"; content: string } | null>(null);

  useEffect(() => {
    function handleClick() { setActiveMenuId(null); }
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <section className="figma-settings-page">
      {toast && <div className="figma-toast">{toast}</div>}
      <div className="figma-settings-header"><h1>System Settings</h1></div>
      <div className="figma-settings-tabs-bar">
        <button type="button" className={`figma-settings-tab ${activeTab === "promotions" ? "active" : ""}`} onClick={() => setActiveTab("promotions")}>Promotions</button>
        <button type="button" className={`figma-settings-tab ${activeTab === "fees" ? "active" : ""}`} onClick={() => { setActiveTab("fees"); setActiveMenuId(null); }}>Transaction Fees</button>
        <button type="button" className={`figma-settings-tab ${activeTab === "mobile" ? "active" : ""}`} onClick={() => { setActiveTab("mobile"); setActiveMenuId(null); }}>Mobile App</button>
        <button type="button" className={`figma-settings-tab ${activeTab === "escrow" ? "active" : ""}`} onClick={() => { setActiveTab("escrow"); setActiveMenuId(null); }}>Escrow Policies</button>
        <button type="button" className={`figma-settings-tab ${activeTab === "serviceArea" ? "active" : ""}`} onClick={() => { setActiveTab("serviceArea"); setActiveMenuId(null); }}>Service Area</button>
        <button type="button" className={`figma-settings-tab ${activeTab === "cancellation" ? "active" : ""}`} onClick={() => { setActiveTab("cancellation"); setActiveMenuId(null); }}>Cancellation &amp; Refund</button>
        <button type="button" className={`figma-settings-tab ${activeTab === "kyc" ? "active" : ""}`} onClick={() => { setActiveTab("kyc"); setActiveMenuId(null); }}>KYC Tiers</button>
        <button type="button" className={`figma-settings-tab ${activeTab === "terms" ? "active" : ""}`} onClick={() => { setActiveTab("terms"); setActiveMenuId(null); }}>Terms &amp; Conditions</button>
        <button type="button" className={`figma-settings-tab ${activeTab === "privacy" ? "active" : ""}`} onClick={() => { setActiveTab("privacy"); setActiveMenuId(null); }}>Privacy Policies</button>
      </div>

      <div className="figma-settings-action-bar">
        {activeTab === "fees" && <button type="button" className="figma-settings-add-btn" onClick={() => setFeeModalOpen(true)}>Edit fee configuration</button>}
        {activeTab === "mobile" && <button type="button" className="figma-settings-add-btn" onClick={() => setMobileModalOpen(true)}>Edit mobile options</button>}
        {activeTab === "escrow" && <button type="button" className="figma-settings-add-btn" onClick={() => { setEditingEscrow(null); setEscrowModalOpen(true); }}>Add new escrow policy</button>}
        {activeTab === "serviceArea" && <button type="button" className="figma-settings-add-btn" onClick={() => setSaModalOpen(true)}>Manage service area</button>}
        {activeTab === "cancellation" && <button type="button" className="figma-settings-add-btn" onClick={() => { setEditingCancel(null); setCancelModalOpen(true); }}>Add new cancellation policy</button>}
        {activeTab === "kyc" && <button type="button" className="figma-settings-add-btn" onClick={() => { setEditingKyc(null); setKycModalOpen(true); }}>Add new tier</button>}
        {activeTab === "terms" && <button type="button" className="figma-settings-add-btn" onClick={() => { setEditingTerm(null); setTermModalOpen(true); }}>Add new term &amp; conditions</button>}
        {activeTab === "privacy" && <button type="button" className="figma-settings-add-btn" onClick={() => { setEditingPrivacy(null); setPrivacyModalOpen(true); }}>Add new privacy policy</button>}
      </div>

      <div className="figma-settings-table-card">
        {activeTab === "promotions" && <PromotionsManagement />}
        {activeTab === "fees" && (
          <div className="figma-settings-fee-config">
            <div className="figma-settings-fee-grid">
              <div className="figma-settings-fee-item"><span className="figma-settings-fee-label">Platform fee</span><span className="figma-settings-fee-value">{feeConfig?.platformFeePercent ?? 10}%</span></div>
              <div className="figma-settings-fee-item"><span className="figma-settings-fee-label">Base delivery fee</span><span className="figma-settings-fee-value">₦{(feeConfig?.baseFeeNaira ?? 1400).toLocaleString()}</span></div>
              <div className="figma-settings-fee-item"><span className="figma-settings-fee-label">Distance rate</span><span className="figma-settings-fee-value">₦{(feeConfig?.distanceRateNairaPerKm ?? 17).toLocaleString()}/km</span></div>
            </div>
            {feeConfig?.updatedAt ? <div className="figma-settings-fee-updated">Last updated {new Date(feeConfig.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div> : null}
          </div>
        )}

        {activeTab === "mobile" && (
          <div className="figma-settings-fee-config">
            <div className="figma-settings-fee-grid">
              <div className="figma-settings-fee-item"><span className="figma-settings-fee-label">Parcel types</span><span className="figma-settings-fee-value">{mobileConfig?.parcelTypes.length ?? 0}</span></div>
              <div className="figma-settings-fee-item"><span className="figma-settings-fee-label">Supported banks</span><span className="figma-settings-fee-value">{mobileConfig?.banks.length ?? 0}</span></div>
              <div className="figma-settings-fee-item"><span className="figma-settings-fee-label">Top-up range</span><span className="figma-settings-fee-value">₦{(mobileConfig?.wallet.minTopUpNaira ?? 0).toLocaleString()} to ₦{(mobileConfig?.wallet.maxTopUpNaira ?? 0).toLocaleString()}</span></div>
            </div>
          </div>
        )}

        {activeTab === "escrow" && (
          <table className="figma-settings-table">
            <thead><tr><th>Policy Name</th><th>Type</th><th>Release Time</th><th className="th-actions">Actions</th></tr></thead>
            <tbody>
              {escrowPolicies.map((policy) => (
                <tr key={policy.id}>
                  <td>{policy.policyName}</td><td>{policy.type}</td><td>{policy.releaseTime}</td>
                  <td className="td-actions">
                    <div className="figma-settings-menu-wrapper">
                      <button type="button" className="figma-settings-menu-trigger" aria-label="Actions" onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === policy.id ? null : policy.id); }}><EllipsisVertical size={18} /></button>
                      {activeMenuId === policy.id && (
                        <div className="figma-settings-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => { setActiveMenuId(null); setEditingEscrow(policy); setEscrowModalOpen(true); }}>Edit Policy</button>
                          <div className="figma-settings-dropdown-divider" />
                          <button type="button" className="danger-item" onClick={async () => { setActiveMenuId(null); if (!onDeleteEscrow) return; try { await onDeleteEscrow({ id: policy.id as Id<"escrowPolicies"> }); setToast("Escrow policy deleted."); } catch (err) { setToast(formatErrorMessage(err, "Failed to delete escrow policy.")); } }}>Delete Policy</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!escrowPolicies.length && <tr><td colSpan={4} className="figma-empty-row">No escrow policies configured</td></tr>}
            </tbody>
          </table>
        )}

        {activeTab === "serviceArea" && (
          <table className="figma-settings-table">
            <thead><tr><th>City / Town</th><th>Type</th><th className="th-actions">Actions</th></tr></thead>
            <tbody>
              <tr>
                <td>{saBase}</td><td><span className="figma-settings-badge-base">Base Location</span></td>
                <td className="td-actions">
                  <div className="figma-settings-menu-wrapper">
                    <button type="button" className="figma-settings-menu-trigger" aria-label="Actions" onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === "sa-base" ? null : "sa-base"); }}><EllipsisVertical size={18} /></button>
                    {activeMenuId === "sa-base" && (
                      <div className="figma-settings-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => { setActiveMenuId(null); setSaModalOpen(true); }}>Edit Service Area</button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
              {saDests.map((d, i) => (
                <tr key={`${d}-${i}`}>
                  <td>{d}</td><td><span className="figma-settings-badge-dest">Destination</span></td>
                  <td className="td-actions">
                    <div className="figma-settings-menu-wrapper">
                      <button type="button" className="figma-settings-menu-trigger" aria-label="Actions" onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === `sa-${i}` ? null : `sa-${i}`); }}><EllipsisVertical size={18} /></button>
                      {activeMenuId === `sa-${i}` && (
                        <div className="figma-settings-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => { setActiveMenuId(null); setSaModalOpen(true); }}>Edit Service Area</button>
                          <div className="figma-settings-dropdown-divider" />
                          <button type="button" className="danger-item" onClick={async () => { setActiveMenuId(null); if (!onUpdateServiceArea) return; const next = saDests.filter((_, idx) => idx !== i); setBusy(true); try { await onUpdateServiceArea({ baseLocation: saBase.trim(), destinations: next }); setSaDests(next); setToast("Destination removed."); } catch (err) { setToast(formatErrorMessage(err, "Failed to remove destination.")); } finally { setBusy(false); } }}>Remove Destination</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!saDests.length && <tr><td colSpan={3} className="figma-empty-row">No destinations configured</td></tr>}
            </tbody>
          </table>
        )}

        {activeTab === "cancellation" && (
          <table className="figma-settings-table">
            <thead><tr><th>Rule Name</th><th>Refund Type</th><th>Refund %</th><th>Window</th><th className="th-actions">Actions</th></tr></thead>
            <tbody>
              {cancellationPolicies.map((policy) => (
                <tr key={policy.id}>
                  <td>{policy.ruleName}</td><td>{policy.refundType}</td><td>{policy.refundPercent}%</td><td>{policy.window}</td>
                  <td className="td-actions">
                    <div className="figma-settings-menu-wrapper">
                      <button type="button" className="figma-settings-menu-trigger" aria-label="Actions" onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === policy.id ? null : policy.id); }}><EllipsisVertical size={18} /></button>
                      {activeMenuId === policy.id && (
                        <div className="figma-settings-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => { setActiveMenuId(null); setEditingCancel(policy); setCancelModalOpen(true); }}>Edit Policy</button>
                          <div className="figma-settings-dropdown-divider" />
                          <button type="button" className="danger-item" onClick={async () => { setActiveMenuId(null); if (!onDeleteCancellation) return; try { await onDeleteCancellation({ id: policy.id as Id<"cancellationPolicies"> }); setToast("Cancellation policy deleted."); } catch (err) { setToast(formatErrorMessage(err, "Failed to delete cancellation policy.")); } }}>Delete Policy</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!cancellationPolicies.length && <tr><td colSpan={5} className="figma-empty-row">No cancellation policies configured</td></tr>}
            </tbody>
          </table>
        )}

        {activeTab === "kyc" && (
          <table className="figma-settings-table">
            <thead><tr><th>Tier</th><th>Requirements</th><th>Max Carry</th><th>Max Shipment Value</th><th className="th-actions">Actions</th></tr></thead>
            <tbody>
              {kycTiers.map((tier) => (
                <tr key={tier.id}>
                  <td>{tier.tierName}</td><td>{tier.requirements.join(", ")}</td><td>{tier.maxCapacityKg ? `${tier.maxCapacityKg} kg` : "—"}</td><td>{tier.maxShipmentValueNaira ? `₦${tier.maxShipmentValueNaira.toLocaleString()}` : "No limit"}</td>
                  <td className="td-actions">
                    <div className="figma-settings-menu-wrapper">
                      <button type="button" className="figma-settings-menu-trigger" aria-label="Actions" onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === tier.id ? null : tier.id); }}><EllipsisVertical size={18} /></button>
                      {activeMenuId === tier.id && (
                        <div className="figma-settings-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => { setActiveMenuId(null); setEditingKyc(tier); setKycModalOpen(true); }}>Edit Tier</button>
                          <div className="figma-settings-dropdown-divider" />
                          <button type="button" className="danger-item" onClick={async () => { setActiveMenuId(null); if (!onDeleteKycTier) return; try { await onDeleteKycTier({ id: tier.id as Id<"kycTiers"> }); setToast("KYC tier deleted."); } catch (err) { setToast(formatErrorMessage(err, "Failed to delete KYC tier.")); } }}>Delete Tier</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!kycTiers.length && <tr><td colSpan={5} className="figma-empty-row">No KYC tiers configured</td></tr>}
            </tbody>
          </table>
        )}

        {activeTab === "terms" && (
          <table className="figma-settings-table">
            <thead><tr><th>Version</th><th>Last Updated</th><th>Status</th><th className="th-actions">Actions</th></tr></thead>
            <tbody>
              {termsItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.version}</td><td>{item.lastUpdated}</td><td>{item.status}</td>
                  <td className="td-actions">
                    <div className="figma-settings-menu-wrapper">
                      <button type="button" className="figma-settings-menu-trigger" aria-label="Actions" onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === item.id ? null : item.id); }}><EllipsisVertical size={18} /></button>
                      {activeMenuId === item.id && (
                        <div className="figma-settings-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => { setActiveMenuId(null); setViewingTerm(item); }}>View T &amp; C</button>
                          <div className="figma-settings-dropdown-divider" />
                          <button type="button" onClick={() => { setActiveMenuId(null); setEditingTerm(item); setTermModalOpen(true); }}>Edit T &amp; C</button>
                          <div className="figma-settings-dropdown-divider" />
                          <button type="button" className="danger-item" onClick={async () => { setActiveMenuId(null); if (!onDeleteSetting) return; try { await onDeleteSetting({ id: item.id as Id<"settings"> }); setToast("T&C deleted."); } catch (err) { setToast(formatErrorMessage(err, "Failed to delete T&C.")); } }}>Delete T &amp; C</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!termsItems.length && <tr><td colSpan={4} className="figma-empty-row">No terms &amp; conditions found</td></tr>}
            </tbody>
          </table>
        )}

        {activeTab === "privacy" && (
          <table className="figma-settings-table">
            <thead><tr><th>Version</th><th>Last Updated</th><th>Status</th><th className="th-actions">Actions</th></tr></thead>
            <tbody>
              {privacyItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.version}</td><td>{item.lastUpdated}</td><td>{item.status}</td>
                  <td className="td-actions">
                    <div className="figma-settings-menu-wrapper">
                      <button type="button" className="figma-settings-menu-trigger" aria-label="Actions" onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === item.id ? null : item.id); }}><EllipsisVertical size={18} /></button>
                      {activeMenuId === item.id && (
                        <div className="figma-settings-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => { setActiveMenuId(null); setViewingPrivacy(item); }}>View Privacy Policy</button>
                          <div className="figma-settings-dropdown-divider" />
                          <button type="button" onClick={() => { setActiveMenuId(null); setEditingPrivacy(item); setPrivacyModalOpen(true); }}>Edit Privacy Policy</button>
                          <div className="figma-settings-dropdown-divider" />
                          <button type="button" className="danger-item" onClick={async () => { setActiveMenuId(null); if (!onDeleteSetting) return; try { await onDeleteSetting({ id: item.id as Id<"settings"> }); setToast("Privacy policy deleted."); } catch (err) { setToast(formatErrorMessage(err, "Failed to delete privacy policy.")); } }}>Delete Privacy Policy</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!privacyItems.length && <tr><td colSpan={4} className="figma-empty-row">No privacy policies found</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {feeModalOpen && <FeeConfigModal config={feeConfig} onClose={() => setFeeModalOpen(false)} onSave={async (config) => { if (!onUpdateFeeConfig) return; setBusy(true); try { await onUpdateFeeConfig(config); setToast("Fee configuration updated."); setFeeModalOpen(false); } catch (err) { setToast(formatErrorMessage(err, "Failed to update fee config.")); } finally { setBusy(false); } }} />}
      {mobileModalOpen && mobileConfig && <MobileConfigModal config={mobileConfig} onClose={() => setMobileModalOpen(false)} onSave={async (config) => { setBusy(true); try { await updateMobileConfig({ config }); setToast("Mobile options updated."); setMobileModalOpen(false); } catch (err) { setToast(formatErrorMessage(err, "Failed to update mobile options.")); } finally { setBusy(false); } }} />}
      {escrowModalOpen && <EscrowPolicyModal initialData={editingEscrow} onClose={() => { setEscrowModalOpen(false); setEditingEscrow(null); }} onSave={async (item) => { if (!onCreateEscrow && !onUpdateEscrow) return; setBusy(true); try { if (editingEscrow) { await onUpdateEscrow?.({ id: editingEscrow.id as Id<"escrowPolicies">, ...item }); setToast("Escrow policy updated."); } else { await onCreateEscrow?.(item); setToast("Escrow policy created."); } setEscrowModalOpen(false); setEditingEscrow(null); } catch (err) { setToast(formatErrorMessage(err, "Failed to save escrow policy.")); } finally { setBusy(false); } }} />}
      {saModalOpen && <ServiceAreaModal baseLocation={saBase} destinations={saDests} onClose={() => setSaModalOpen(false)} onSave={async (newBase, newDests) => { if (!onUpdateServiceArea) return; setBusy(true); try { await onUpdateServiceArea({ baseLocation: newBase, destinations: newDests }); setSaBase(newBase); setSaDests(newDests); setToast("Service area updated."); setSaModalOpen(false); } catch (err) { setToast(formatErrorMessage(err, "Failed to update service area.")); } finally { setBusy(false); } }} />}
      {cancelModalOpen && <CancellationPolicyModal initialData={editingCancel} onClose={() => { setCancelModalOpen(false); setEditingCancel(null); }} onSave={async (item) => { if (!onCreateCancellation && !onUpdateCancellation) return; setBusy(true); try { if (editingCancel) { await onUpdateCancellation?.({ id: editingCancel.id as Id<"cancellationPolicies">, ...item }); setToast("Cancellation policy updated."); } else { await onCreateCancellation?.(item); setToast("Cancellation policy created."); } setCancelModalOpen(false); setEditingCancel(null); } catch (err) { setToast(formatErrorMessage(err, "Failed to save cancellation policy.")); } finally { setBusy(false); } }} />}
      {kycModalOpen && <KycTierModal initialData={editingKyc} onClose={() => { setKycModalOpen(false); setEditingKyc(null); }} onSave={async (item) => { if (!onCreateKycTier && !onUpdateKycTier) return; setBusy(true); try { if (editingKyc) { await onUpdateKycTier?.({ id: editingKyc.id as Id<"kycTiers">, ...item }); setToast("KYC tier updated."); } else { await onCreateKycTier?.(item); setToast("KYC tier created."); } setKycModalOpen(false); setEditingKyc(null); } catch (err) { setToast(formatErrorMessage(err, "Failed to save KYC tier.")); } finally { setBusy(false); } }} />}
      {termModalOpen && <TermConditionsModal initialData={editingTerm} onClose={() => { setTermModalOpen(false); setEditingTerm(null); }} onSave={async (item, status) => { if (!onCreateSetting && !onUpdateSetting) return; setBusy(true); try { const body = buildSettingBody(item.version, status, item.content); if (editingTerm) { await onUpdateSetting?.({ id: editingTerm.id as Id<"settings">, title: item.title, body }); setToast("T&C updated."); } else { const key = `terms_${Date.now()}`; await onCreateSetting?.({ key, title: item.title, body }); setToast("T&C created."); } setTermModalOpen(false); setEditingTerm(null); } catch (err) { setToast(formatErrorMessage(err, "Failed to save T&C.")); } finally { setBusy(false); } }} />}
      {viewingTerm && <ViewTermConditionsModal item={viewingTerm} onClose={() => setViewingTerm(null)} onUpdate={() => { const itemToEdit = viewingTerm; setViewingTerm(null); setEditingTerm(itemToEdit); setTermModalOpen(true); }} />}
      {privacyModalOpen && <PrivacyPolicyModal initialData={editingPrivacy} onClose={() => { setPrivacyModalOpen(false); setEditingPrivacy(null); }} onSave={async (item, status) => { if (!onCreateSetting && !onUpdateSetting) return; setBusy(true); try { const body = buildSettingBody(item.version, status, item.content); if (editingPrivacy) { await onUpdateSetting?.({ id: editingPrivacy.id as Id<"settings">, title: item.title, body }); setToast("Privacy policy updated."); } else { const key = `privacy_${Date.now()}`; await onCreateSetting?.({ key, title: item.title, body }); setToast("Privacy policy created."); } setPrivacyModalOpen(false); setEditingPrivacy(null); } catch (err) { setToast(formatErrorMessage(err, "Failed to save privacy policy.")); } finally { setBusy(false); } }} />}
      {viewingPrivacy && <ViewPrivacyPolicyModal item={viewingPrivacy} onClose={() => setViewingPrivacy(null)} onUpdate={() => { const itemToEdit = viewingPrivacy; setViewingPrivacy(null); setEditingPrivacy(itemToEdit); setPrivacyModalOpen(true); }} />}
    </section>
  );
}

function MobileConfigModal({ config, onClose, onSave }: { config: MobileProductConfig; onClose: () => void; onSave: (config: MobileProductConfig) => void }) {
  const [value, setValue] = useState(JSON.stringify(config, null, 2));
  const [error, setError] = useState("");
  return <div className="figma-settings-modal-overlay" onClick={onClose}>
    <div className="figma-settings-modal" onClick={event => event.stopPropagation()}>
      <div className="figma-settings-modal-header"><h2>Mobile app options</h2><button type="button" className="figma-settings-modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
      <form className="figma-settings-modal-form" onSubmit={event => { event.preventDefault(); try { setError(""); onSave(JSON.parse(value) as MobileProductConfig); } catch { setError("Enter valid JSON before saving."); } }}>
        <div className="figma-settings-field"><label>Product configuration</label><textarea rows={22} spellCheck={false} value={value} onChange={event => setValue(event.target.value)} /></div>
        <p>Controls parcel choices, wallet presets and limits, supported banks, and residence options shown in the mobile app.</p>
        {error && <p role="alert" className="error-message">{error}</p>}
        <div className="figma-settings-modal-actions"><button type="submit" className="btn-save">Save options</button></div>
      </form>
    </div>
  </div>;
}

function FeeConfigModal({ config, onClose, onSave }: { config?: FeeConfig; onClose: () => void; onSave: (args: { platformFeePercent: number; baseFeeNaira: number; distanceRateNairaPerKm: number; minFeeNaira: number; categoryMultipliers?: Record<string, number>; weightMultipliers?: { minKg: number; maxKg: number; multiplier: number }[] }) => void }) {
  const [platformFee, setPlatformFee] = useState(String(config?.platformFeePercent ?? 10));
  const [baseFee, setBaseFee] = useState(String(config?.baseFeeNaira ?? 1400));
  const [distanceRate, setDistanceRate] = useState(String(config?.distanceRateNairaPerKm ?? 17));
  const [minFee, setMinFee] = useState(String(config?.minFeeNaira ?? 2000));
  const defaultCats: Record<string, string> = { Documents: "1", Clothing: "1.12", Electronics: "1.25", Books: "1.08", "Household items": "1.18", Other: "1.15" };
  const [catMults, setCatMults] = useState<Record<string, string>>(() => {
    const result: Record<string, string> = { ...defaultCats };
    if (config?.categoryMultipliers) { for (const [k, v] of Object.entries(config.categoryMultipliers)) result[k] = String(v); }
    return result;
  });
  const [weightTiers, setWeightTiers] = useState<{ minKg: string; maxKg: string; multiplier: string }[]>(() => {
    if (config?.weightMultipliers?.length) return config.weightMultipliers.map((t) => ({ minKg: String(t.minKg), maxKg: t.maxKg === Infinity ? "" : String(t.maxKg), multiplier: String(t.multiplier) }));
    return [{ minKg: "0", maxKg: "5", multiplier: "1" }, { minKg: "5", maxKg: "15", multiplier: "1.3" }, { minKg: "15", maxKg: "", multiplier: "1.6" }];
  });
  const updateCat = (key: string, val: string) => setCatMults((prev) => ({ ...prev, [key]: val }));
  const removeCat = (key: string) => setCatMults((prev) => { const next = { ...prev }; delete next[key]; return next; });
  const [catName, setCatName] = useState("");
  const addCat = () => { const name = catName.trim(); if (!name || catMults[name] !== undefined) return; setCatMults((prev) => ({ ...prev, [name]: "1" })); setCatName(""); };
  const updateTier = (i: number, field: "minKg" | "maxKg" | "multiplier", val: string) => setWeightTiers((prev) => prev.map((t, idx) => idx === i ? { ...t, [field]: val } : t));
  const addTier = () => setWeightTiers((prev) => [...prev, { minKg: "", maxKg: "", multiplier: "1" }]);
  const removeTier = (i: number) => setWeightTiers((prev) => prev.filter((_, idx) => idx !== i));
  return (
    <div className="figma-settings-modal-overlay" onClick={onClose}>
      <div className="figma-settings-modal figma-settings-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="figma-settings-modal-header"><h2>Edit Fee Configuration</h2><button type="button" className="figma-settings-modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <form onSubmit={(e) => { e.preventDefault(); const cats: Record<string, number> = {}; for (const [k, v] of Object.entries(catMults)) { const n = Number(v); if (n > 0) cats[k] = n; } const weights = weightTiers.filter((t) => t.minKg && t.multiplier).map((t) => ({ minKg: Number(t.minKg) || 0, maxKg: t.maxKg ? Number(t.maxKg) : Infinity, multiplier: Number(t.multiplier) || 1 })).sort((a, b) => a.minKg - b.minKg); onSave({ platformFeePercent: Number(platformFee) || 10, baseFeeNaira: Number(baseFee) || 1400, distanceRateNairaPerKm: Number(distanceRate) || 17, minFeeNaira: Number(minFee) || 2000, categoryMultipliers: Object.keys(cats).length ? cats : undefined, weightMultipliers: weights.length ? weights : undefined }); }} className="figma-settings-modal-form">
          <div className="figma-settings-field-group"><div className="figma-settings-field"><label>Platform fee (%)</label><input type="number" min="0" max="50" value={platformFee} onChange={(e) => setPlatformFee(e.target.value)} autoFocus /></div><div className="figma-settings-field"><label>Base delivery fee (₦)</label><input type="number" min="0" max="100000" value={baseFee} onChange={(e) => setBaseFee(e.target.value)} /></div></div>
          <div className="figma-settings-field-group"><div className="figma-settings-field"><label>Distance rate (₦/km)</label><input type="number" min="0" max="1000" value={distanceRate} onChange={(e) => setDistanceRate(e.target.value)} /></div><div className="figma-settings-field"><label>Minimum fee (₦)</label><input type="number" min="0" max="100000" value={minFee} onChange={(e) => setMinFee(e.target.value)} /></div></div>
          <div className="figma-settings-section-label">Category multipliers</div>
          <div className="figma-settings-cat-grid">{Object.entries(catMults).map(([key, val]) => <div key={key} className="figma-settings-cat-item"><span className="figma-settings-cat-name">{key}</span><input type="number" min="0" max="10" step="0.01" value={val} onChange={(e) => updateCat(key, e.target.value)} /><button type="button" className="figma-settings-tier-remove" onClick={() => removeCat(key)} aria-label={`Remove ${key}`}><X size={14} /></button></div>)}</div>
          <div className="figma-settings-cat-add"><input type="text" placeholder="New category name" value={catName} onChange={(e) => setCatName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCat(); } }} /><button type="button" className="figma-settings-tier-add" onClick={addCat}>+ Add</button></div>
          <div className="figma-settings-section-label">Weight-based pricing (per kg tier)</div>
          {weightTiers.map((tier, i) => <div key={i} className="figma-settings-tier-row"><input type="number" min="0" placeholder="Min kg" value={tier.minKg} onChange={(e) => updateTier(i, "minKg", e.target.value)} /><span className="figma-settings-tier-sep">–</span><input type="number" min="0" placeholder="Max kg" value={tier.maxKg} onChange={(e) => updateTier(i, "maxKg", e.target.value)} /><span className="figma-settings-tier-sep">×</span><input type="number" min="0" max="10" step="0.1" placeholder="Multiplier" value={tier.multiplier} onChange={(e) => updateTier(i, "multiplier", e.target.value)} />{weightTiers.length > 1 && <button type="button" className="figma-settings-tier-remove" onClick={() => removeTier(i)} aria-label="Remove tier"><X size={16} /></button>}</div>)}
          <button type="button" className="figma-settings-tier-add" onClick={addTier}>+ Add weight tier</button>
          <div className="figma-settings-modal-actions"><button type="submit" className="btn-save">Save</button></div>
        </form>
      </div>
    </div>
  );
}

function EscrowPolicyModal({ initialData, onClose, onSave }: { initialData: { id: string; policyName: string; type: string; releaseTime: string } | null; onClose: () => void; onSave: (item: { policyName: string; type: string; releaseTime: string }) => void }) {
  const [policyName, setPolicyName] = useState(initialData?.policyName ?? "");
  const [type, setType] = useState(initialData?.type ?? "Time Based");
  const [releaseTime, setReleaseTime] = useState(initialData?.releaseTime === "--" ? "" : (initialData?.releaseTime ?? ""));
  return (
    <div className="figma-settings-modal-overlay" onClick={onClose}>
      <div className="figma-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="figma-settings-modal-header"><h2>{initialData ? "Edit Escrow Policy" : "Add Escrow Policy"}</h2><button type="button" className="figma-settings-modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <form onSubmit={(e) => { e.preventDefault(); onSave({ policyName: policyName.trim() || "Policy", type, releaseTime: releaseTime.trim() || "--" }); }} className="figma-settings-modal-form">
          <div className="figma-settings-field"><label>Policy Name</label><input type="text" value={policyName} onChange={(e) => setPolicyName(e.target.value)} autoFocus /></div>
          <div className="figma-settings-field"><label>Policy Type</label><div className="figma-settings-select-wrap"><select value={type} onChange={(e) => setType(e.target.value)}><option value="Time Based">Time Based</option><option value="Confirmation Based">Confirmation Based</option><option value="Milestone Based">Milestone Based</option></select><ChevronDown size={18} className="select-arrow" /></div></div>
          <div className="figma-settings-field"><label>Release Time</label><input type="text" value={releaseTime} onChange={(e) => setReleaseTime(e.target.value)} /></div>
          <div className="figma-settings-modal-actions"><button type="submit" className="btn-save">Save</button></div>
        </form>
      </div>
    </div>
  );
}

function ServiceAreaModal({ baseLocation, destinations, onClose, onSave }: { baseLocation: string; destinations: string[]; onClose: () => void; onSave: (baseLocation: string, destinations: string[]) => void }) {
  const [base, setBase] = useState(baseLocation);
  const [dests, setDests] = useState<string[]>(destinations);
  const [newDest, setNewDest] = useState("");
  const addDest = () => { const name = newDest.trim(); if (!name) return; if (name.toLowerCase() === base.trim().toLowerCase()) return; if (dests.map(d => d.toLowerCase()).includes(name.toLowerCase())) return; setDests((prev) => [...prev, name]); setNewDest(""); };
  return (
    <div className="figma-settings-modal-overlay" onClick={onClose}>
      <div className="figma-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="figma-settings-modal-header"><h2>Manage Service Area</h2><button type="button" className="figma-settings-modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <form onSubmit={(e) => { e.preventDefault(); onSave(base.trim() || "Jos", dests); }} className="figma-settings-modal-form">
          <div className="figma-settings-field"><label>Base Location</label><input type="text" value={base} onChange={(e) => setBase(e.target.value)} placeholder="e.g. Jos" autoFocus /></div>
          <div className="figma-settings-field">
            <label>Destinations</label>
            <div className="figma-settings-cat-grid">
              {dests.map((d, i) => <div key={`${d}-${i}`} className="figma-settings-cat-item"><span className="figma-settings-cat-name">{d}</span><button type="button" className="figma-settings-tier-remove" onClick={() => setDests((prev) => prev.filter((_, idx) => idx !== i))} aria-label={`Remove ${d}`}><X size={14} /></button></div>)}
              {!dests.length && <div className="figma-empty-row" style={{ gridColumn: "1 / -1" }}>No destinations added</div>}
            </div>
            <div className="figma-settings-cat-add"><input type="text" placeholder="Add destination" value={newDest} onChange={(e) => setNewDest(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDest(); } }} /><button type="button" className="figma-settings-tier-add" onClick={addDest}>+ Add</button></div>
          </div>
          <div className="figma-settings-modal-actions"><button type="submit" className="btn-save">Save</button></div>
        </form>
      </div>
    </div>
  );
}

function CancellationPolicyModal({ initialData, onClose, onSave }: { initialData: { id: string; ruleName: string; refundType: string; refundPercent: number; window: string } | null; onClose: () => void; onSave: (item: { ruleName: string; refundType: string; refundPercent: number; window: string }) => void }) {
  const [ruleName, setRuleName] = useState(initialData?.ruleName ?? "");
  const [refundType, setRefundType] = useState(initialData?.refundType ?? "Full Refund");
  const [refundPercent, setRefundPercent] = useState(String(initialData?.refundPercent ?? 100));
  const [window, setWindow] = useState(initialData?.window ?? "");
  return (
    <div className="figma-settings-modal-overlay" onClick={onClose}>
      <div className="figma-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="figma-settings-modal-header"><h2>{initialData ? "Edit Cancellation Policy" : "Add Cancellation Policy"}</h2><button type="button" className="figma-settings-modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <form onSubmit={(e) => { e.preventDefault(); onSave({ ruleName: ruleName.trim() || "Policy", refundType, refundPercent: Number(refundPercent) || 0, window: window.trim() || "Any time" }); }} className="figma-settings-modal-form">
          <div className="figma-settings-field"><label>Rule Name</label><input type="text" value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="e.g. Sender cancels before departure" autoFocus /></div>
          <div className="figma-settings-field"><label>Refund Type</label><div className="figma-settings-select-wrap"><select value={refundType} onChange={(e) => setRefundType(e.target.value)}><option value="Full Refund">Full Refund</option><option value="Partial Refund">Partial Refund</option><option value="No Refund">No Refund</option></select><ChevronDown size={18} className="select-arrow" /></div></div>
          {refundType === "Partial Refund" && <div className="figma-settings-field"><label>Refund %</label><input type="number" min="0" max="100" value={refundPercent} onChange={(e) => setRefundPercent(e.target.value)} /></div>}
          <div className="figma-settings-field"><label>Timing / Window</label><input type="text" value={window} onChange={(e) => setWindow(e.target.value)} placeholder="e.g. Up to 24hrs before departure" /></div>
          <div className="figma-settings-modal-actions"><button type="submit" className="btn-save">Save</button></div>
        </form>
      </div>
    </div>
  );
}

function KycTierModal({ initialData, onClose, onSave }: { initialData: { id: string; tierName: string; requirements: string[]; maxShipmentValueNaira: number; maxCapacityKg?: number; description?: string } | null; onClose: () => void; onSave: (item: { tierName: string; requirements: string[]; maxShipmentValueNaira: number; maxCapacityKg?: number; description?: string }) => void }) {
  const [tierName, setTierName] = useState(initialData?.tierName ?? "");
  const [requirements, setRequirements] = useState<string[]>(initialData?.requirements ?? []);
  const [newReq, setNewReq] = useState("");
  const [maxCapacity, setMaxCapacity] = useState(initialData?.maxCapacityKg ? String(initialData.maxCapacityKg) : "");
  const [maxValue, setMaxValue] = useState(initialData?.maxShipmentValueNaira ? String(initialData.maxShipmentValueNaira) : "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const addReq = () => { const name = newReq.trim(); if (!name || requirements.map(r => r.toLowerCase()).includes(name.toLowerCase())) return; setRequirements((prev) => [...prev, name]); setNewReq(""); };
  return (
    <div className="figma-settings-modal-overlay" onClick={onClose}>
      <div className="figma-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="figma-settings-modal-header"><h2>{initialData ? "Edit KYC Tier" : "Add KYC Tier"}</h2><button type="button" className="figma-settings-modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <form onSubmit={(e) => { e.preventDefault(); onSave({ tierName: tierName.trim() || "Tier", requirements, maxShipmentValueNaira: Number(maxValue) || 0, maxCapacityKg: Number(maxCapacity) || undefined, description: description.trim() || undefined }); }} className="figma-settings-modal-form">
          <div className="figma-settings-field"><label>Tier Name</label><input type="text" value={tierName} onChange={(e) => setTierName(e.target.value)} placeholder="e.g. Tier 1" autoFocus /></div>
          <div className="figma-settings-field">
            <label>Verification Requirements</label>
            <div className="figma-settings-cat-grid">
              {requirements.map((r, i) => <div key={`${r}-${i}`} className="figma-settings-cat-item"><span className="figma-settings-cat-name">{r}</span><button type="button" className="figma-settings-tier-remove" onClick={() => setRequirements((prev) => prev.filter((_, idx) => idx !== i))} aria-label={`Remove ${r}`}><X size={14} /></button></div>)}
              {!requirements.length && <div className="figma-empty-row" style={{ gridColumn: "1 / -1" }}>No requirements added</div>}
            </div>
            <div className="figma-settings-cat-add"><input type="text" placeholder="e.g. Phone verification" value={newReq} onChange={(e) => setNewReq(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addReq(); } }} /><button type="button" className="figma-settings-tier-add" onClick={addReq}>+ Add</button></div>
          </div>
          <div className="figma-settings-field"><label>Max Carry Capacity (kg)</label><input type="number" min="0" max="2000" value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} placeholder="e.g. 45 — travellers at this tier may carry up to this weight per trip" /></div>
          <div className="figma-settings-field"><label>Max Shipment Value (₦)</label><input type="number" min="0" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} placeholder="0 = no limit" /></div>
          <div className="figma-settings-field"><label>Description (optional)</label><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description of this tier" /></div>
          <div className="figma-settings-modal-actions"><button type="submit" className="btn-save">Save</button></div>
        </form>
      </div>
    </div>
  );
}

function TermConditionsModal({ initialData, onClose, onSave }: { initialData: { id: string; key: string; title: string; version: string; status: "Draft" | "Published"; content: string } | null; onClose: () => void; onSave: (item: { version: string; title: string; content: string }, status: "Draft" | "Published") => void }) {
  const [version, setVersion] = useState(initialData?.version ?? "V1.0");
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [content, setContent] = useState(initialData?.content ?? "");
  const handleSave = (status: "Draft" | "Published") => { onSave({ version: version.trim() || "V1.0", title: title.trim() || "Terms of Service", content: content.trim() }, status); };
  return (
    <div className="figma-settings-modal-overlay" onClick={onClose}>
      <div className="figma-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="figma-settings-modal-header"><h2>{initialData ? "Edit Term & Conditions" : "Add Term & Conditions"}</h2><button type="button" className="figma-settings-modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <form onSubmit={(e) => e.preventDefault()} className="figma-settings-modal-form">
          <div className="figma-settings-field"><label>Enter Version</label><input type="text" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="V2.1" autoFocus /></div>
          <div className="figma-settings-field"><label>Enter Title</label><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Account & User Responsibilities" /></div>
          <div className="figma-settings-field"><label>Enter T&amp;C</label><textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Enter terms and conditions..." /></div>
          <div className="figma-settings-modal-actions"><button type="button" className="btn-draft" onClick={() => handleSave("Draft")}>Save as Draft</button><button type="button" className="btn-publish" onClick={() => handleSave("Published")}>Publish</button></div>
        </form>
      </div>
    </div>
  );
}

function ViewTermConditionsModal({ item, onClose, onUpdate }: { item: { id: string; key: string; title: string; version: string; status: "Draft" | "Published"; content: string }; onClose: () => void; onUpdate: () => void }) {
  const bulletItems = item.content.split("\n").map((line) => line.replace(/^•\s*/, "").trim()).filter(Boolean);
  return (
    <div className="figma-settings-modal-overlay" onClick={onClose}>
      <div className="figma-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="figma-settings-modal-header"><h2>Term &amp; Conditions</h2><button type="button" className="figma-settings-modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <div className="figma-settings-view-body">
          <div className="figma-settings-view-group"><div className="figma-settings-view-label">Version</div><div className="figma-settings-view-val">{item.version}</div></div>
          <div className="figma-settings-view-group"><div className="figma-settings-view-label">Title</div><div className="figma-settings-view-val">{item.title}</div></div>
          <div className="figma-settings-view-group"><div className="figma-settings-view-label">Terms &amp; Conditions</div><ul className="figma-settings-view-bullets">{bulletItems.map((point, index) => <li key={index}>{point}</li>)}</ul></div>
        </div>
        <div className="figma-settings-modal-actions"><button type="button" className="btn-update" onClick={onUpdate}>Update</button></div>
      </div>
    </div>
  );
}

function PrivacyPolicyModal({ initialData, onClose, onSave }: { initialData: { id: string; key: string; title: string; version: string; status: "Draft" | "Published"; content: string } | null; onClose: () => void; onSave: (item: { version: string; title: string; content: string }, status: "Draft" | "Published") => void }) {
  const [version, setVersion] = useState(initialData?.version ?? "V1.0");
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [content, setContent] = useState(initialData?.content ?? "");
  const handleSave = (status: "Draft" | "Published") => { onSave({ version: version.trim() || "V1.0", title: title.trim() || "Privacy Policy", content: content.trim() }, status); };
  return (
    <div className="figma-settings-modal-overlay" onClick={onClose}>
      <div className="figma-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="figma-settings-modal-header"><h2>{initialData ? "Edit Privacy Policy" : "Add Privacy Policy"}</h2><button type="button" className="figma-settings-modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <form onSubmit={(e) => e.preventDefault()} className="figma-settings-modal-form">
          <div className="figma-settings-field"><label>Enter Version</label><input type="text" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="V2.1" autoFocus /></div>
          <div className="figma-settings-field"><label>Enter Title</label><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Data Collection" /></div>
          <div className="figma-settings-field"><label>Enter Privacy Policy</label><textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Enter privacy policy details..." /></div>
          <div className="figma-settings-modal-actions"><button type="button" className="btn-draft" onClick={() => handleSave("Draft")}>Save as Draft</button><button type="button" className="btn-publish" onClick={() => handleSave("Published")}>Publish</button></div>
        </form>
      </div>
    </div>
  );
}

function ViewPrivacyPolicyModal({ item, onClose, onUpdate }: { item: { id: string; key: string; title: string; version: string; status: "Draft" | "Published"; content: string }; onClose: () => void; onUpdate: () => void }) {
  const bulletItems = item.content.split("\n").map((line) => line.replace(/^•\s*/, "").trim()).filter(Boolean);
  return (
    <div className="figma-settings-modal-overlay" onClick={onClose}>
      <div className="figma-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="figma-settings-modal-header"><h2>Privacy Policy</h2><button type="button" className="figma-settings-modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <div className="figma-settings-view-body">
          <div className="figma-settings-view-group"><div className="figma-settings-view-label">Version</div><div className="figma-settings-view-val">{item.version}</div></div>
          <div className="figma-settings-view-group"><div className="figma-settings-view-label">Title</div><div className="figma-settings-view-val">{item.title}</div></div>
          <div className="figma-settings-view-group"><div className="figma-settings-view-label">Data we collect</div><ul className="figma-settings-view-bullets">{bulletItems.map((point, index) => <li key={index}>{point}</li>)}</ul></div>
        </div>
        <div className="figma-settings-modal-actions"><button type="button" className="btn-update" onClick={onUpdate}>Update</button></div>
      </div>
    </div>
  );
}
