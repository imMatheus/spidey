export const STYLES = `
:host {
  --ds-blue-100: oklch(97.32% .0141 251.56);
  --ds-blue-700: oklch(57.61% .2508 258.23);
  --ds-blue-900: oklch(46.84% .1923 257.74);

  --ds-red-200: oklch(95.41% .0299 14.2526);
  --ds-red-700: oklch(62.56% .2524 23.03);
  --ds-red-900: oklch(54.99% .232 25.29);

  --ds-amber-200: oklch(96.81% .0495 90.2423);
  --ds-amber-700: oklch(81.87% .1969 76.46);
  --ds-amber-900: oklch(52.79% .1496 54.65);

  --ds-green-200: oklch(96.92% .037 147.15);
  --ds-green-700: oklch(64.58% .1746 147.27);
  --ds-green-900: oklch(51.75% .1453 147.65);

  --ds-gray-100-value: 0, 0%, 95%;
  --ds-gray-300-value: 0, 0%, 90%;
  --ds-gray-600-value: 0, 0%, 66%;
  --ds-gray-700-value: 0, 0%, 56%;
  --ds-gray-900-value: 0, 0%, 30%;
  --ds-gray-1000-value: 0, 0%, 9%;

  --ds-gray-100: hsla(var(--ds-gray-100-value), 1);
  --ds-gray-300: hsla(var(--ds-gray-300-value), 1);
  --ds-gray-600: hsla(var(--ds-gray-600-value), 1);
  --ds-gray-700: hsla(var(--ds-gray-700-value), 1);
  --ds-gray-900: hsla(var(--ds-gray-900-value), 1);
  --ds-gray-1000: hsla(var(--ds-gray-1000-value), 1);

  --ds-background-100-value: 0, 0%, 100%;
  --ds-background-200-value: 0, 0%, 98%;
  --ds-background-100: hsla(var(--ds-background-100-value), 1);
  --ds-background-200: hsla(var(--ds-background-200-value), 1);

  --ds-shadow-border-base: 0 0 0 1px #00000014;
  --ds-shadow-background-border: 0 0 0 1px var(--ds-background-200);
  --ds-shadow-menu:
    var(--ds-shadow-border-base),
    0px 1px 1px #00000005,
    0px 4px 8px -4px #0000000a,
    0px 16px 24px -8px #0000000f,
    var(--ds-shadow-background-border);
}

:host, :host * {
  box-sizing: border-box;
}

.layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483646;
}

.trigger-wrapper {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483647;
  pointer-events: auto;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

.trigger {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: var(--ds-gray-1000);
  color: var(--ds-gray-100);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 1px solid hsla(var(--ds-gray-100-value), 0.1);
  box-shadow: 0 6px 18px hsla(var(--ds-gray-1000-value), 0.25);
  font-size: 18px;
  line-height: 1;
  user-select: none;
  transition: transform 120ms ease, background 120ms ease;
}
.trigger:hover { transform: translateY(-1px); }
.trigger.active { background: var(--ds-blue-700); }

.trigger-counter {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--ds-background-100);
  pointer-events: none;
  user-select: none;
  letter-spacing: 0.02em;
  transform: scale(1);
  transition: transform 180ms cubic-bezier(.175, .885, .32, 1.1), opacity 180ms ease;
}
.trigger-counter.hidden {
  transform: scale(0);
  opacity: 0;
}
.trigger-counter.running {
  background: var(--ds-amber-900);
  color: var(--ds-amber-200);
}
.trigger-counter.idle {
  background: var(--ds-green-900);
  color: var(--ds-green-200);
}
.trigger-counter.failed {
  background: var(--ds-red-900);
  color: var(--ds-red-200);
}

.trigger-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  min-width: 220px;
  max-width: 320px;
  list-style: none;
  margin: 0;
  padding: 4px;
  background: var(--ds-background-100);
  border-radius: 12px;
  box-shadow: var(--ds-shadow-menu);
  font-size: 14px;
  outline: none;
  overflow: hidden auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  transform-origin: bottom right;
  transition:
    opacity 200ms cubic-bezier(.175, .885, .32, 1.1),
    transform 200ms cubic-bezier(.175, .885, .32, 1.1);
  opacity: 0;
  transform: scale(0.92) translateY(6px);
  pointer-events: none;
}
.trigger-menu.open {
  opacity: 1;
  transform: scale(1) translateY(0);
  pointer-events: auto;
}

.trigger-menu-item {
  cursor: pointer;
  height: 28px;
  padding: 0 8px;
  color: var(--ds-gray-1000);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  user-select: none;
}
.trigger-menu-item:hover {
  background: hsla(var(--ds-gray-1000-value), 0.05);
}
.trigger-menu-item.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.trigger-menu-item.disabled:hover {
  background: transparent;
}
.trigger-menu-item.danger {
  color: var(--ds-red-700);
}
.trigger-menu-item.danger:hover {
  background: color-mix(in oklch, var(--ds-red-700) 8%, transparent);
}
.trigger-menu-item .kbd {
  font-family: -apple-system, "SF Pro Text", "Segoe UI Symbol", system-ui, ui-sans-serif, sans-serif;
  font-size: 11px;
  color: var(--ds-gray-700);
  background: hsla(var(--ds-gray-1000-value), 0.05);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}

.time-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.time-chip svg {
  width: 1em;
  height: 1em;
  flex-shrink: 0;
}
.trigger-menu-item.compact {
  font-size: 12px;
  height: 26px;
}
.trigger-menu-item.compact .label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.crosshair {
  cursor: crosshair;
}

.outline {
  position: fixed;
  border: 1px solid;
  border-radius: 0;
  pointer-events: none;
  transition: border-color 150ms ease, opacity 400ms ease;
  box-sizing: border-box;
}
.outline.hover {
  border-color: var(--ds-blue-900);
  background: color-mix(in oklch, var(--ds-blue-900) 10%, transparent);
}
.outline.selected {
  border-color: var(--ds-blue-900);
  background: color-mix(in oklch, var(--ds-blue-900) 10%, transparent);
}
.outline.running {
  border-color: var(--ds-amber-700);
  box-shadow: 0 0 0 1px color-mix(in oklch, var(--ds-amber-700) 25%, transparent);
}
.outline.done { border-color: var(--ds-green-700); }
.outline.failed { border-color: var(--ds-red-700); }
.outline.fading { opacity: 0; }

.outline.animating-position {
  transition:
    left 280ms cubic-bezier(.175, .885, .32, 1.1),
    top 280ms cubic-bezier(.175, .885, .32, 1.1),
    width 280ms cubic-bezier(.175, .885, .32, 1.1),
    height 280ms cubic-bezier(.175, .885, .32, 1.1),
    border-color 150ms ease,
    opacity 400ms ease;
}

.prompt-box.animating-position {
  transition:
    left 280ms cubic-bezier(.175, .885, .32, 1.1),
    top 280ms cubic-bezier(.175, .885, .32, 1.1);
}

.tag-label {
  position: fixed;
  background: var(--ds-blue-700);
  color: var(--ds-gray-100);
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
  background: var(--ds-gray-1000);
  color: var(--ds-gray-100);
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
  box-shadow: 0 4px 10px hsla(var(--ds-gray-1000-value), 0.2);
  transition: opacity 400ms ease;
}
.badge.fading { opacity: 0; }
.badge .step {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}
.badge.running {
  background: var(--ds-amber-900);
  color: var(--ds-amber-200);
}
.badge.done {
  background: var(--ds-green-900);
  color: var(--ds-green-200);
}
.badge.failed {
  background: var(--ds-red-900);
  color: var(--ds-red-200);
  cursor: help;
}

.spinner {
  width: 10px;
  height: 10px;
  border: 2px solid color-mix(in oklch, currentColor 30%, transparent);
  border-top-color: currentColor;
  border-radius: 999px;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

.prompt-box {
  position: fixed;
  background: var(--ds-background-100);
  border-radius: 12px;
  box-shadow: var(--ds-shadow-menu);
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
  color: var(--ds-gray-700);
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
  border: 1px solid var(--ds-gray-300);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  min-height: 60px;
  color: var(--ds-gray-1000);
  background: var(--ds-gray-100);
}
.prompt-box textarea:focus { border-color: var(--ds-blue-700); }
.prompt-box .row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.prompt-box .hint {
  font-size: 11px;
  color: var(--ds-gray-600);
}
.prompt-box button {
  background: var(--ds-gray-1000);
  color: var(--ds-gray-100);
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.prompt-box button:hover { background: var(--ds-gray-900); }
.prompt-box button:disabled { opacity: 0.5; cursor: not-allowed; }

.diff-sidebar {
  position: fixed;
  top: 16px;
  right: 16px;
  bottom: 16px;
  width: 480px;
  max-width: calc(100vw - 32px);
  background: var(--ds-background-100);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--ds-shadow-menu);
  /* same as .trigger-wrapper; sidebar is appended later in the layer so
     DOM-order tie-breaking puts it on top. */
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  transform: translateX(calc(100% + 24px));
  transition: transform 280ms cubic-bezier(.175, .885, .32, 1.1);
}
.diff-sidebar.open { transform: translateX(0); }

.diff-sidebar-header {
  position: relative;
  padding: 16px 40px 14px 16px;
  border-bottom: 1px solid hsla(var(--ds-gray-1000-value), 0.06);
}
.diff-sidebar-prompt {
  font-size: 14px;
  font-weight: 600;
  color: var(--ds-gray-1000);
  line-height: 1.4;
  word-break: break-word;
}
.diff-sidebar-meta {
  margin-top: 6px;
  font-size: 12px;
  color: var(--ds-gray-700);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.diff-sidebar-close {
  position: absolute;
  top: 10px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: transparent;
  border: none;
  color: var(--ds-gray-700);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
}
.diff-sidebar-close:hover {
  background: hsla(var(--ds-gray-1000-value), 0.06);
  color: var(--ds-gray-1000);
}

.diff-sidebar-tabs-strip {
  flex-shrink: 0;
  border-bottom: 1px solid hsla(var(--ds-gray-1000-value), 0.06);
  display: flex;
}
.diff-sidebar-tabs {
  position: relative;
  display: flex;
  width: max-content;
  height: 26px;
  margin: 12px;
}
.diff-sidebar-tab-indicator {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 0;
  background: var(--ds-gray-100);
  box-shadow: 0 0 0 1px hsla(var(--ds-gray-1000-value), 0.08);
  border-radius: 6px;
  transform: translateX(0);
  transition:
    transform 220ms cubic-bezier(.175, .885, .32, 1.1),
    width 220ms cubic-bezier(.175, .885, .32, 1.1);
  pointer-events: none;
  z-index: 0;
}
.diff-sidebar-tab {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--ds-gray-900);
  cursor: pointer;
  user-select: none;
  transition: color 150ms ease;
}
.diff-sidebar-tab:hover:not(.active) {
  color: var(--ds-gray-1000);
}
.diff-sidebar-tab.active {
  color: var(--ds-gray-1000);
}
.diff-sidebar-tab .tab-count {
  color: var(--ds-gray-700);
  font-weight: 500;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.diff-sidebar-tab .tab-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
.diff-sidebar-tab .tab-icon svg {
  width: 14px;
  height: 14px;
}

.changes-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--ds-gray-700);
  padding: 4px 4px 8px;
  border-bottom: 1px dashed hsla(var(--ds-gray-1000-value), 0.06);
}
.changes-summary .counts {
  display: inline-flex;
  gap: 8px;
}
.changes-summary .add { color: var(--ds-green-900); }
.changes-summary .del { color: var(--ds-red-900); }

.diff-sidebar-body {
  flex: 1;
  overflow: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 28px;
  font-size: 13px;
  color: var(--ds-gray-1000);
}
.diff-sidebar-body.changes-body {
  gap: 12px;
}

.thread-turn {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.thread-turn .turn-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  justify-content: flex-end;
}
.thread-turn .turn-prompt {
  max-width: 80%;
  background: var(--ds-blue-100);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  color: var(--ds-blue-900);
  word-break: break-word;
  line-height: 1.45;
}
.thread-turn .turn-meta {
  font-size: 11px;
  color: var(--ds-gray-700);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 4px;
}
.thread-turn .turn-meta .turn-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.thread-turn .turn-meta .turn-status.running { color: var(--ds-amber-900); }
.thread-turn .turn-meta .turn-status.done { color: var(--ds-green-900); }
.thread-turn .turn-meta .turn-status.failed { color: var(--ds-red-900); }
.thread-turn .turn-meta .turn-status .dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
}
.thread-turn .turn-meta .turn-status.running .dot {
  animation: spidey-pulse 1.2s ease-in-out infinite;
}
@keyframes spidey-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
.thread-turn .turn-files {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.thread-turn .turn-error {
  background: var(--ds-red-200);
  color: var(--ds-red-900);
  padding: 8px 10px;
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
.thread-turn .turn-empty {
  font-size: 12px;
  color: var(--ds-gray-700);
  font-style: italic;
  padding: 0 4px;
}

.diff-sidebar-composer {
  border-top: 1px solid hsla(var(--ds-gray-1000-value), 0.06);
  padding: 12px;
  background: var(--ds-background-100);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.diff-sidebar-composer textarea {
  width: 100%;
  resize: none;
  border: 1px solid var(--ds-gray-300);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  min-height: 60px;
  color: var(--ds-gray-1000);
  background: var(--ds-gray-100);
}
.diff-sidebar-composer textarea:focus { border-color: var(--ds-blue-700); }
.diff-sidebar-composer .composer-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.diff-sidebar-composer .composer-hint {
  font-size: 11px;
  color: var(--ds-gray-600);
}
.diff-sidebar-composer button {
  background: var(--ds-gray-1000);
  color: var(--ds-gray-100);
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.diff-sidebar-composer button:hover { background: var(--ds-gray-900); }
.diff-sidebar-composer button:disabled { opacity: 0.5; cursor: not-allowed; }
.diff-sidebar-body.loading,
.diff-sidebar-body.error,
.diff-sidebar-empty {
  color: var(--ds-gray-700);
  font-style: italic;
}
.diff-sidebar-error {
  background: var(--ds-red-200);
  color: var(--ds-red-900);
  padding: 8px 10px;
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

.file-block {
  border: 1px solid hsla(var(--ds-gray-1000-value), 0.08);
  border-radius: 8px;
  overflow: hidden;
  background: var(--ds-background-100);
}
.file-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: hsla(var(--ds-gray-1000-value), 0.03);
  border-bottom: 1px solid hsla(var(--ds-gray-1000-value), 0.06);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
.file-block-head .file-path {
  color: var(--ds-gray-1000);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
.file-block-head .file-counts {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.file-block-head .file-counts .add { color: var(--ds-green-900); }
.file-block-head .file-counts .del { color: var(--ds-red-900); }
.file-block-head .file-counts .file-tag {
  background: var(--ds-blue-100);
  color: var(--ds-blue-900);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.diff-pre {
  margin: 0;
  padding: 4px 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  background: var(--ds-background-100);
}
.diff-line {
  padding: 0 12px;
  white-space: pre;
  overflow-wrap: normal;
}
.diff-line.add {
  background: var(--ds-green-200);
  color: var(--ds-green-900);
}
.diff-line.del {
  background: var(--ds-red-200);
  color: var(--ds-red-900);
}
.diff-line.hunk {
  color: var(--ds-gray-700);
  background: hsla(var(--ds-gray-1000-value), 0.03);
}
.diff-line.context {
  color: var(--ds-gray-1000);
}
`
