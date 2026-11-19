import React, { useState } from 'react';
import { X, Sliders, RotateCcw, Check, Info } from 'lucide-react';
import { useSensors } from '../context/SensorContext';

function extractFormData(thresholds) {
  const data = {};
  if (!thresholds) return data;
  Object.keys(thresholds).forEach((k) => {
    const goodBand = thresholds[k].bands[0];
    data[k] = {
      min: goodBand.min,
      max: goodBand.max,
    };
  });
  return data;
}

function ThresholdDialog({ onClose }) {
  const { thresholds, updateGoodThreshold, resetThresholds } = useSensors();
  const [formData, setFormData] = useState(() => extractFormData(thresholds));
  const [savedMessage, setSavedMessage] = useState(false);

  const handleChange = (key, field, val) => {
    setFormData((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: val,
      },
    }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    Object.keys(formData).forEach((k) => {
      const min = parseFloat(formData[k].min);
      const max = parseFloat(formData[k].max);
      if (!isNaN(min) && !isNaN(max) && min < max) {
        updateGoodThreshold(k, min, max);
      }
    });
    setSavedMessage(true);
    setTimeout(() => {
      setSavedMessage(false);
      onClose();
    }, 900);
  };

  const handleReset = () => {
    resetThresholds();
    setSavedMessage(true);
    setTimeout(() => {
      setSavedMessage(false);
      onClose();
    }, 900);
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-window" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <Sliders size={20} className="modal-icon" />
            <div>
              <h3 className="modal-title">Configure Water Quality Thresholds</h3>
              <p className="modal-sub">
                Adjust boundary values used by the edge controller to classify sensor telemetry.
              </p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="modal-body">
          <div className="threshold-grid">
            {Object.keys(thresholds).map((k) => {
              const item = thresholds[k];
              const formItem = formData[k] || { min: 0, max: 0 };
              return (
                <div className="threshold-card" key={k}>
                  <div className="threshold-card-top">
                    <span className="threshold-name">{item.label}</span>
                    <span className="threshold-unit">{item.unit || 'unitless'}</span>
                  </div>
                  <div className="threshold-inputs">
                    <div className="input-group">
                      <label htmlFor={`${k}-min`}>Good Min</label>
                      <input
                        id={`${k}-min`}
                        type="number"
                        step={item.step || 0.1}
                        value={formItem.min}
                        onChange={(e) => handleChange(k, 'min', e.target.value)}
                        required
                      />
                    </div>
                    <span className="range-sep">to</span>
                    <div className="input-group">
                      <label htmlFor={`${k}-max`}>Good Max</label>
                      <input
                        id={`${k}-max`}
                        type="number"
                        step={item.step || 0.1}
                        value={formItem.max}
                        onChange={(e) => handleChange(k, 'max', e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="threshold-hint">
                    Standard target range for surface water / lake revitalization
                  </div>
                </div>
              );
            })}
          </div>

          <div className="modal-notice">
            <Info size={16} />
            <span>
              Changes take effect immediately across all dashboard widgets, status cards, and alerts.
            </span>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={handleReset}>
              <RotateCcw size={15} /> Reset Defaults
            </button>
            <div className="modal-actions-right">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                {savedMessage ? <Check size={16} /> : null}
                {savedMessage ? 'Applied!' : 'Save & Reclassify'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ThresholdConfigModal({ isOpen, onClose }) {
  if (!isOpen) return null;
  return <ThresholdDialog onClose={onClose} />;
}
