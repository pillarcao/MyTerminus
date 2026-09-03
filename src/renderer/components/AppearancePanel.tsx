import { AppearanceConfig, DEFAULT_APPEARANCE } from '@shared/types';

interface Props {
  config: AppearanceConfig;
  /** Applied live — App.tsx pushes it straight into CSS custom properties. */
  onChange: (config: AppearanceConfig) => void;
  onClose: () => void;
}

const KNOBS: Array<{
  key: keyof AppearanceConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}> = [
  { key: 'glassOpacity', label: 'Glass opacity', min: 0.15, max: 1, step: 0.01 },
  { key: 'blurOverlay', label: 'Overlay blur', min: 0, max: 40, step: 1, unit: 'px' },
  { key: 'uiTintHue', label: 'Tint hue', min: 0, max: 360, step: 1, unit: '°' },
  { key: 'uiTintSat', label: 'Tint saturation', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'uiTintLight', label: 'Tint lightness', min: 0, max: 100, step: 1, unit: '%' },
];

export default function AppearancePanel({ config, onChange, onClose }: Props) {
  // Dragging a slider is one store update per pixel; the file is written once, on close.
  const closeAndSave = () => {
    window.electronAPI.saveAppearanceConfig(config);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={closeAndSave}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Appearance</h3>
          <span className="host-count">applies live</span>
        </div>
        <div className="modal-body">
          {KNOBS.map((k) => (
            <div className="form-group" key={k.key}>
              <label>
                {k.label}
                <span className="knob-value">{config[k.key]}{k.unit ?? ''}</span>
              </label>
              <input
                type="range"
                min={k.min}
                max={k.max}
                step={k.step}
                value={config[k.key]}
                onChange={(e) => onChange({ ...config, [k.key]: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>
        <div className="modal-footer">
          {/* Recovery path: sliders can reach an unreadable UI (lightness 0 + opacity 1). */}
          <button className="btn btn-secondary" onClick={() => onChange(DEFAULT_APPEARANCE)}>
            Reset
          </button>
          <button className="btn btn-secondary" onClick={() => window.electronAPI.openAppearanceConfig()}>
            Edit File…
          </button>
          <button className="btn btn-primary" onClick={closeAndSave}>Done</button>
        </div>
      </div>
    </div>
  );
}
