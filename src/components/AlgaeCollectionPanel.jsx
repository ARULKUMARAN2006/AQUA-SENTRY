import React from 'react';
import { AlertTriangle, Recycle, Trash2 } from 'lucide-react';
import { useSensors } from '../context/SensorContext';

/**
 * Algae Collection & Waste Basket — a separate physical capture stage after
 * ultrasonic stimulation and filtration.
 *
 * Important: ultrasonic treatment may disrupt algae cells, but it does not by
 * itself remove biomass from the water. This panel represents a conceptual
 * collection/filtration step that gathers the separated algae. All values are
 * simulated and are not measured removal.
 */
export default function AlgaeCollectionPanel() {
  const { collectionStatus, emptyBasket } = useSensors();
  const {
    active,
    basketFillPct,
    capacityMg,
    collectedMg,
    collectionProgressPct,
    remainingAlgae,
    sessionCollectedMg,
    wasteFull,
  } = collectionStatus;

  const statusLabel = wasteFull ? 'BASKET FULL' : active ? 'COLLECTING' : 'IDLE';
  const statusTone = wasteFull ? 'off' : active ? 'on' : 'off';

  return (
    <section className="section panel algae-collection-panel">
      <div className="rev-header">
        <h2 className="section-title">
          <Recycle size={16} className="inline-icon" /> Algae Collection &amp; Waste Basket
        </h2>
        <span className="sim-badge">Simulated capture stage</span>
      </div>

      <p className="sim-intro">
        After ultrasonic stimulation separates algae, this stage simulates a separate physical
        collection step: the separated particles are gathered and transferred into a waste basket.
        Ultrasonic treatment may disrupt algae cells, but it does not by itself remove biomass — the
        basket is a conceptual capture step, not a measured removal.
      </p>

      <div className="algae-collection-grid">
        <div className="algae-collection-metrics">
          <div className="sim-algae-row">
            <span className="sim-algae-label">Collection mechanism</span>
            <span className={`sim-treatment-status ${statusTone}`}>{statusLabel}</span>
          </div>

          <div className="algae-metric-grid">
            <div className="algae-metric">
              <span>Collection progress</span>
              <strong>{collectionProgressPct}%</strong>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${collectionProgressPct}%` }} />
              </div>
            </div>

            <div className="algae-metric">
              <span>Collected this session</span>
              <strong>
                {sessionCollectedMg} <small>mg</small>
              </strong>
            </div>

            <div className="algae-metric">
              <span>Basket capacity</span>
              <strong>
                {basketFillPct}% <small>({collectedMg}/{capacityMg} mg)</small>
              </strong>
              <div className={`progress-track basket-track ${wasteFull ? 'full' : ''}`}>
                <div
                  className="progress-fill basket-fill"
                  style={{ width: `${basketFillPct}%` }}
                />
              </div>
            </div>

            <div className="algae-metric">
              <span>Remaining algae concentration</span>
              <strong>
                {remainingAlgae} <small>mg/L (simulated)</small>
              </strong>
            </div>
          </div>

          {wasteFull && (
            <div className="waste-full-alert" role="alert">
              <AlertTriangle size={15} />
              <span>Waste basket full — empty the basket to continue collecting.</span>
            </div>
          )}

          <div className="algae-collection-actions">
            <button
              type="button"
              className="sim-btn"
              onClick={emptyBasket}
              disabled={collectedMg === 0}
            >
              <Trash2 size={15} /> Empty basket
            </button>
            <span className="sim-state">
              Simulated mass: 1 concentration unit ≈ {collectionStatus.massPerUnit} mg · capacity{' '}
              {capacityMg} mg
            </span>
          </div>
        </div>

        <div className="basket-viz-wrap">
          <div className={`basket-viz ${wasteFull ? 'full' : ''}`} aria-hidden="true">
            <div className="basket-lid" />
            <div className="basket-body">
              <div className="basket-viz-fill" style={{ height: `${basketFillPct}%` }} />
            </div>
          </div>
          <span className="basket-viz-label">Waste basket · {basketFillPct}% full</span>
        </div>
      </div>

      <p className="sim-readings-note">
        Collection values are illustrative and are derived from the same live simulated concentration
        that drives the 3D algae field. The What-If Simulator is a separate predictive model in mg/L;
        these figures are not measured biomass removal.
      </p>
    </section>
  );
}
