import { useState, useEffect } from "react";
import { CheckCheck, MoreVertical, X } from "lucide-react";
import { DashboardSnapshot, money } from "@passenger/core";

export function RealTimeMonitoring({ snapshot }: { snapshot?: DashboardSnapshot }) {
  const [openMenu, setOpenMenu] = useState<{ id: string; type: "sender" | "traveler" | "checkin" } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Auto-dismiss toast after 4s
  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenMenu(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const handleAction = (actionLabel: string, deliveryId: string) => {
    setOpenMenu(null);
    setToastMessage(`${actionLabel} for delivery #${deliveryId} initiated.`);
  };

  const activeUsersCount = snapshot ? (snapshot.people?.filter(p => !p.suspended).length ?? 0) : 15;
  const inTransitShipments = snapshot?.shipments?.filter(s => s.status === "in_transit" || s.status === "funded") ?? [];
  const ongoingCount = snapshot ? inTransitShipments.length : 5;

  return (
    <div className="figma-monitoring-page">
      <div className="figma-monitoring-header">
        <h1>Real-time Activities</h1>
      </div>

      <div className="figma-monitoring-stats">
        <div className="figma-monitoring-stat-card">
          <span className="stat-label">Active Users</span>
          <span className="stat-value">{activeUsersCount}</span>
        </div>
        <div className="figma-monitoring-stat-card">
          <span className="stat-label">Ongoing Deliveries</span>
          <span className="stat-value">{ongoingCount}</span>
        </div>
      </div>

      <div className="figma-monitoring-section">
        <h2>Ongoing Deliveries</h2>
        <div className="figma-monitoring-table-container">
          <table className="figma-monitoring-table">
            <thead>
              <tr>
                <th>Live Location</th>
                <th>Route</th>
                <th>Delivery Fee</th>
                <th>Sender</th>
                <th>Traveler</th>
                <th>No of Check-ins</th>
              </tr>
            </thead>
            <tbody>
              {snapshot ? (
                inTransitShipments.length > 0 ? (
                  inTransitShipments.map((s) => (
                    <tr key={s.id}>
                      <td>{s.latestLocationLabel || `${s.origin} (In transit)`}</td>
                      <td>{s.origin} → {s.destination}</td>
                      <td>{money(s.feeNaira)}</td>
                      <td>
                        <div className="table-cell-with-action">
                          <span>{s.senderName}</span>
                          <button
                            className="action-btn"
                            aria-label={`Options for sender of delivery ${s.reference || s.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenu(openMenu?.id === s.id && openMenu?.type === "sender" ? null : { id: s.id, type: "sender" });
                            }}
                          >
                            <MoreVertical size={16} />
                          </button>
                          {openMenu?.id === s.id && openMenu?.type === "sender" && (
                            <div className="action-menu" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => handleAction("Contact Sender", s.reference || s.id)}>Contact Sender</button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="table-cell-with-action">
                          <span>{s.travellerName || "Assigned traveller"}</span>
                          <button
                            className="action-btn"
                            aria-label={`Options for traveler of delivery ${s.reference || s.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenu(openMenu?.id === s.id && openMenu?.type === "traveler" ? null : { id: s.id, type: "traveler" });
                            }}
                          >
                            <MoreVertical size={16} />
                          </button>
                          {openMenu?.id === s.id && openMenu?.type === "traveler" && (
                            <div className="action-menu" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => handleAction("Contact Traveler", s.reference || s.id)}>Contact Traveler</button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="table-cell-with-action">
                          <span>{s.locationCheckInCount ?? 0}</span>
                          <button
                            className="action-btn"
                            aria-label={`Options for check-ins of delivery ${s.reference || s.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenu(openMenu?.id === s.id && openMenu?.type === "checkin" ? null : { id: s.id, type: "checkin" });
                            }}
                          >
                            <MoreVertical size={16} />
                          </button>
                          {openMenu?.id === s.id && openMenu?.type === "checkin" && (
                            <div className="action-menu action-menu-right" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => handleAction("Send Notification", s.reference || s.id)}>Send Notification</button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "#666" }}>
                      No deliveries currently in transit.
                    </td>
                  </tr>
                )
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "#666" }}>
                    Loading real-time monitoring data…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {toastMessage && (
        <div className="toast" role="status">
          <CheckCheck size={18} />
          <span>{toastMessage}</span>
          <button aria-label="Dismiss notification" onClick={() => setToastMessage(null)}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

