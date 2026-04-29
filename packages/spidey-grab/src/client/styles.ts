export const STYLES = `
:host, :host * {
  box-sizing: border-box;
}

.layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483646;
}

.trigger {
  position: fixed;
  right: 16px;
  bottom: 16px;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: #111827;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 6px 18px rgba(0,0,0,0.25);
  z-index: 2147483647;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 18px;
  line-height: 1;
  user-select: none;
  pointer-events: auto;
  transition: transform 120ms ease, background 120ms ease;
}
.trigger:hover { transform: translateY(-1px); }
.trigger.active { background: #2563eb; }

.crosshair {
  cursor: crosshair;
}

.outline {
  position: fixed;
  border: 2px solid;
  border-radius: 3px;
  pointer-events: none;
  transition: border-color 150ms ease, opacity 400ms ease;
  box-sizing: border-box;
}
.outline.hover {
  border-color: #3b82f6;
  border-style: dashed;
}
.outline.selected { border-color: #3b82f6; }
.outline.running {
  border-color: #f59e0b;
  box-shadow: 0 0 0 1px rgba(245,158,11,0.25);
}
.outline.done { border-color: #10b981; }
.outline.failed { border-color: #ef4444; }
.outline.fading { opacity: 0; }

.tag-label {
  position: fixed;
  background: #3b82f6;
  color: #fff;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px 4px 0 0;
  pointer-events: none;
  white-space: nowrap;
  line-height: 1.4;
}

.badge {
  position: fixed;
  background: #111827;
  color: #fff;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 11px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  pointer-events: auto;
  white-space: nowrap;
  max-width: 280px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.2);
  transition: opacity 400ms ease;
}
.badge.fading { opacity: 0; }
.badge .step {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}
.badge.running { background: #b45309; }
.badge.done { background: #065f46; }
.badge.failed { background: #991b1b; cursor: help; }

.spinner {
  width: 10px;
  height: 10px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 999px;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

.prompt-box {
  position: fixed;
  background: #ffffff;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 12px 32px rgba(0,0,0,0.18);
  padding: 8px;
  width: 360px;
  max-width: calc(100vw - 32px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: auto;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.prompt-box .meta {
  font-size: 11px;
  color: #6b7280;
  padding: 0 4px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.prompt-box .meta .file {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prompt-box textarea {
  width: 100%;
  resize: none;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  min-height: 60px;
  color: #111827;
  background: #fff;
}
.prompt-box textarea:focus { border-color: #2563eb; }
.prompt-box .row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.prompt-box .hint {
  font-size: 11px;
  color: #9ca3af;
}
.prompt-box button {
  background: #111827;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.prompt-box button:hover { background: #1f2937; }
.prompt-box button:disabled { opacity: 0.5; cursor: not-allowed; }
`;
