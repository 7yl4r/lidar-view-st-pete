import { useEffect } from "react";

interface DataInfoModalProps {
  onClose: () => void;
}

export function DataInfoModal({ onClose }: DataInfoModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-info-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>

        <h2 id="data-info-title" className="modal__title">
          More Info
        </h2>

        <section className="modal__section">
          <h3>Terrain &amp; LiDAR point cloud</h3>
          <p>
            The elevation surface and LiDAR point cloud covering downtown
            St. Petersburg come from USGS 3DEP airborne LiDAR, project{" "}
            <code>FL_Peninsular_2018_D18</code> (2018), distributed by the{" "}
            <strong>Florida Geographic Information Office</strong>:
          </p>
        </section>

        <section className="modal__section">
          <h3>Credit</h3>
          <p>
            Data processing and this visualization were created by the{" "}
            <strong>University of South Florida</strong>. For more information
	    contact tylarmurray@usf.edu
          </p>
        </section>
      </div>
    </div>
  );
}
