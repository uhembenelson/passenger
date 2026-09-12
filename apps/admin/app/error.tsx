"use client";

import { useEffect } from "react";
import { formatErrorMessage } from "@passenger/core";
import { Gate } from "../components/admin-root";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled admin application error:", error);
  }, [error]);

  const message = formatErrorMessage(error, "An unexpected error occurred in the operations workspace.");

  return (
    <Gate title="We couldn’t load this page">
      <p>An unexpected problem occurred while rendering this operations view. No operational change has been made.</p>
      <div role="alert" className="error-message">
        {message}
      </div>
      <div style={{ display: "flex", gap: "10px", marginTop: "1rem" }}>
        <button className="button primary" onClick={() => reset()}>
          Try again
        </button>
        <button className="button secondary" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </div>
    </Gate>
  );
}
