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
          <h3>Point cloud colour key</h3>
          <ul className="modal__legend">
            <li>
              <span className="modal__swatch modal__swatch--ramp" />
              <span>
                <strong>Unclassified / unmapped</strong> — shaded dark (low)
                to light (high) by elevation instead of one flat colour.
                Roughly half of all points fall in this bucket.
              </span>
            </li>
            <li>
              <span
                className="modal__swatch"
                style={{ background: "rgb(176, 152, 115)" }}
              />
              <span>
                <strong>Ground</strong>
              </span>
            </li>
            <li>
              <span
                className="modal__swatch"
                style={{ background: "rgb(198, 93, 59)" }}
              />
              <span>
                <strong>Building</strong>
              </span>
            </li>
            <li>
              <span
                className="modal__swatch"
                style={{ background: "rgb(104, 148, 92)" }}
              />
              <span>
                <strong>Vegetation</strong> (low / medium / high) — not
                present in this delivery
              </span>
            </li>
            <li>
              <span
                className="modal__swatch"
                style={{ background: "rgb(46, 110, 142)" }}
              />
              <span>
                <strong>Water</strong> — rare (about 1% of points)
              </span>
            </li>
            <li>
              <span
                className="modal__swatch"
                style={{ background: "rgb(140, 120, 100)" }}
              />
              <span>
                <strong>Bridge deck</strong> — very rare (under 1% of points)
              </span>
            </li>
          </ul>
          <p>
            Colours come from each point&rsquo;s ASPRS classification code in
            the original 2018 survey, not from this app. Classification
            quality varies across the source data: unclassified points
            dominate this particular delivery, and several classes above are
            rare or entirely absent in this downtown St. Petersburg area.
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
