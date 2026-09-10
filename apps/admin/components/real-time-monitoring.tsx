import { useState, useEffect } from "react";
import { CheckCheck, MoreVertical, X } from "lucide-react";

type Delivery = {
  id: string;
  liveLocation: string;
  route: string;
  fee: string;
  sender: string;
  traveler: string;
  checkIns: number;
};

const mockDeliveries: Delivery[] = [
  { id: "1", liveLocation: "Keffi, Nasarawa", route: "Jos -> Abuja", fee: "N2,000", sender: "John Doe", traveler: "John Doe", checkIns: 2 },
  { id: "2", liveLocation: "Keffi, Nasarawa", route: "Jos -> Abuja", fee: "N2,000", sender: "John Doe", traveler: "John Doe", checkIns: 2 },
  { id: "3", liveLocation: "Keffi, Nasarawa", route: "Jos -> Abuja", fee: "N2,000", sender: "John Doe", traveler: "John Doe", checkIns: 2 },
  { id: "4", liveLocation: "Keffi, Nasarawa", route: "Jos -> Abuja", fee: "N2,000", sender: "John Doe", traveler: "John Doe", checkIns: 2 },
  { id: "5", liveLocation: "Keffi, Nasarawa", route: "Jos -> Abuja", fee: "N2,000", sender: "John Doe", traveler: "John Doe", checkIns: 2 },
];

export function RealTimeMonitoring() {
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

  return (
    <div className="figma-monitoring-page">
      <div className="figma-monitoring-header">
        <h1>Real-time Activities</h1>
      </div>

      <div className="figma-monitoring-stats">
        <div className="figma-monitoring-stat-card">
          <span className="stat-label">Active Users</span>
          <span className="stat-value">15</span>
        </div>
        <div className="figma-monitoring-stat-card">
          <span className="stat-label">Ongoing Deliveries</span>
          <span className="stat-value">5</span>
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
              {mockDeliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td>{delivery.liveLocation}</td>
                  <td>{delivery.route}</td>
                  <td>{delivery.fee}</td>
                  <td>
                    <div className="table-cell-with-action">
                      <span>{delivery.sender}</span>
                      <button
                        className="action-btn"
                        aria-label={`Options for sender of delivery ${delivery.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenu(openMenu?.id === delivery.id && openMenu?.type === "sender" ? null : { id: delivery.id, type: "sender" });
                        }}
                      >
                        <MoreVertical size={16} />
                      </button>
                      {openMenu?.id === delivery.id && openMenu?.type === "sender" && (
                        <div className="action-menu" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => handleAction("Contact Sender", delivery.id)}>Contact Sender</button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="table-cell-with-action">
                      <span>{delivery.traveler}</span>
                      <button
                        className="action-btn"
                        aria-label={`Options for traveler of delivery ${delivery.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenu(openMenu?.id === delivery.id && openMenu?.type === "traveler" ? null : { id: delivery.id, type: "traveler" });
                        }}
                      >
                        <MoreVertical size={16} />
                      </button>
                      {openMenu?.id === delivery.id && openMenu?.type === "traveler" && (
                        <div className="action-menu" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => handleAction("Contact Traveler", delivery.id)}>Contact Traveler</button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="table-cell-with-action">
                      <span>{delivery.checkIns}</span>
                      <button
                        className="action-btn"
                        aria-label={`Options for check-ins of delivery ${delivery.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenu(openMenu?.id === delivery.id && openMenu?.type === "checkin" ? null : { id: delivery.id, type: "checkin" });
                        }}
                      >
                        <MoreVertical size={16} />
                      </button>
                      {openMenu?.id === delivery.id && openMenu?.type === "checkin" && (
                        <div className="action-menu action-menu-right" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => handleAction("Send Notification", delivery.id)}>Send Notification</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
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
