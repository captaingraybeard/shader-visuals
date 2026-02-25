// Overlay UI — glassmorphism controls, settings panel, toast notifications

const STORAGE_KEY = 'shader-visuals-api-key';
const AUTO_HIDE_MS = 5000;

const PRESETS = ['Cosmic Ocean', 'Neon Grid', 'Forest Fire', 'Crystal Cave', 'Void'] as const;

export class UI {
  onGenerate: ((scene: string, vibe: string) => void) | null = null;
  onPresetSelect: ((name: string) => void) | null = null;
  onIntensityChange: ((value: number) => void) | null = null;
  onMicToggle: (() => void) | null = null;
  onMusicFile: ((file: File) => void) | null = null;
  onApiKeyChange: ((key: string) => void) | null = null;

  private overlay!: HTMLElement;
  private toastEl!: HTMLElement;
  private panel!: HTMLElement;
  private settingsPanel!: HTMLElement;
  private generateBtn!: HTMLButtonElement;
  private sceneInput!: HTMLInputElement;
  private vibeInput!: HTMLInputElement;
  private micBtn!: HTMLButtonElement;
  private musicBtn!: HTMLButtonElement;
  private fileInput!: HTMLInputElement;
  private settingsBtn!: HTMLButtonElement;
  private apiKeyInput!: HTMLInputElement;
  private intensitySlider!: HTMLInputElement;
  private intensityLabel!: HTMLElement;

  private hideTimer = 0;
  private visible = false;
  private settingsOpen = false;

  init(): void {
    this.injectStyles();

    this.overlay = document.getElementById('overlay')!;
    this.toastEl = document.getElementById('toast')!;

    // Build main controls panel
    this.panel = el('div', 'sv-panel');

    // Scene input
    this.sceneInput = el('input', 'sv-input') as HTMLInputElement;
    this.sceneInput.type = 'text';
    this.sceneInput.placeholder = 'describe a scene...';
    this.sceneInput.autocomplete = 'off';

    // Vibe input
    this.vibeInput = el('input', 'sv-input') as HTMLInputElement;
    this.vibeInput.type = 'text';
    this.vibeInput.placeholder = 'set the vibe...';
    this.vibeInput.autocomplete = 'off';

    // Generate button
    this.generateBtn = el('button', 'sv-btn sv-btn-primary') as HTMLButtonElement;
    this.generateBtn.textContent = 'Generate';
    this.generateBtn.addEventListener('click', () => {
      this.onGenerate?.(this.sceneInput.value.trim(), this.vibeInput.value.trim());
    });

    // Preset buttons row
    const presetRow = el('div', 'sv-preset-row');
    for (const name of PRESETS) {
      const btn = el('button', 'sv-btn sv-btn-preset') as HTMLButtonElement;
      btn.textContent = name;
      btn.addEventListener('click', () => {
        this.onPresetSelect?.(name);
        this.resetAutoHide();
      });
      presetRow.appendChild(btn);
    }

    // Intensity slider
    const sliderGroup = el('div', 'sv-slider-group');
    const sliderHeader = el('div', 'sv-slider-header');
    const sliderTitle = el('span', 'sv-slider-title');
    sliderTitle.textContent = 'Intensity';
    this.intensityLabel = el('span', 'sv-slider-value');
    this.intensityLabel.textContent = '50%';
    sliderHeader.appendChild(sliderTitle);
    sliderHeader.appendChild(this.intensityLabel);

    this.intensitySlider = el('input', 'sv-slider') as HTMLInputElement;
    this.intensitySlider.type = 'range';
    this.intensitySlider.min = '0';
    this.intensitySlider.max = '100';
    this.intensitySlider.value = '50';
    this.intensitySlider.addEventListener('input', () => {
      const v = parseInt(this.intensitySlider.value, 10);
      this.intensityLabel.textContent = `${v}%`;
      this.onIntensityChange?.(v / 100);
      this.resetAutoHide();
    });

    sliderGroup.appendChild(sliderHeader);
    sliderGroup.appendChild(this.intensitySlider);

    // Bottom toolbar: mic + settings
    const toolbar = el('div', 'sv-toolbar');

    this.micBtn = el('button', 'sv-btn sv-btn-icon') as HTMLButtonElement;
    this.micBtn.innerHTML = micOffIcon;
    this.micBtn.title = 'Toggle microphone';
    this.micBtn.addEventListener('click', () => {
      this.onMicToggle?.();
      this.resetAutoHide();
    });

    // Music file button
    this.musicBtn = el('button', 'sv-btn sv-btn-icon') as HTMLButtonElement;
    this.musicBtn.innerHTML = musicIcon;
    this.musicBtn.title = 'Play music file';
    this.fileInput = el('input', '') as HTMLInputElement;
    this.fileInput.type = 'file';
    this.fileInput.accept = 'audio/*';
    this.fileInput.style.display = 'none';
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      if (file) {
        this.onMusicFile?.(file);
      }
      this.fileInput.value = '';
      this.resetAutoHide();
    });
    this.musicBtn.addEventListener('click', () => {
      this.fileInput.click();
      this.resetAutoHide();
    });

    this.settingsBtn = el('button', 'sv-btn sv-btn-icon') as HTMLButtonElement;
    this.settingsBtn.innerHTML = gearIcon;
    this.settingsBtn.title = 'Settings';
    this.settingsBtn.addEventListener('click', () => {
      this.toggleSettings();
      this.resetAutoHide();
    });

    toolbar.appendChild(this.micBtn);
    toolbar.appendChild(this.musicBtn);
    toolbar.appendChild(this.fileInput);
    toolbar.appendChild(this.settingsBtn);

    // Settings panel
    this.settingsPanel = el('div', 'sv-settings');
    const settingsTitle = el('div', 'sv-settings-title');
    settingsTitle.textContent = 'Settings';
    const apiKeyGroup = el('div', 'sv-apikey-group');
    const apiKeyLabel = el('label', 'sv-label');
    apiKeyLabel.textContent = 'Anthropic API Key';
    this.apiKeyInput = el('input', 'sv-input sv-input-key') as HTMLInputElement;
    this.apiKeyInput.type = 'password';
    this.apiKeyInput.placeholder = 'sk-ant-...';
    this.apiKeyInput.autocomplete = 'off';

    // Load stored key
    const storedKey = localStorage.getItem(STORAGE_KEY) ?? '';
    this.apiKeyInput.value = storedKey;

    this.apiKeyInput.addEventListener('input', () => {
      const key = this.apiKeyInput.value.trim();
      localStorage.setItem(STORAGE_KEY, key);
      this.onApiKeyChange?.(key);
      this.resetAutoHide();
    });

    apiKeyGroup.appendChild(apiKeyLabel);
    apiKeyGroup.appendChild(this.apiKeyInput);
    this.settingsPanel.appendChild(settingsTitle);
    this.settingsPanel.appendChild(apiKeyGroup);

    // Assemble panel
    this.panel.appendChild(this.sceneInput);
    this.panel.appendChild(this.vibeInput);
    this.panel.appendChild(this.generateBtn);
    this.panel.appendChild(presetRow);
    this.panel.appendChild(sliderGroup);
    this.panel.appendChild(toolbar);

    this.overlay.appendChild(this.panel);
    this.overlay.appendChild(this.settingsPanel);

    // Show/hide on click/tap
    this.overlay.addEventListener('click', (e) => {
      // If clicking on a control inside the panel, don't toggle visibility
      if ((e.target as HTMLElement).closest('.sv-panel, .sv-settings')) {
        this.resetAutoHide();
        return;
      }
      this.toggleOverlay();
    });

    // Prevent touch passthrough on interactive children
    this.panel.style.pointerEvents = 'auto';
    this.settingsPanel.style.pointerEvents = 'auto';

    // Allow overlay background itself to receive clicks for toggling
    const tapZone = el('div', 'sv-tap-zone');
    tapZone.style.pointerEvents = 'auto';
    this.overlay.insertBefore(tapZone, this.overlay.firstChild);

    // Start hidden
    this.visible = false;
    this.panel.classList.add('sv-hidden');
    this.settingsPanel.classList.add('sv-hidden');

    // Show on first interaction after a short delay
    setTimeout(() => this.showOverlay(), 300);
  }

  showToast(message: string, duration = 3000): void {
    const t = el('div', 'sv-toast');
    t.textContent = message;
    this.toastEl.appendChild(t);
    // Trigger enter animation
    requestAnimationFrame(() => t.classList.add('sv-toast-visible'));
    setTimeout(() => {
      t.classList.remove('sv-toast-visible');
      t.addEventListener('transitionend', () => t.remove());
      // Fallback removal
      setTimeout(() => t.remove(), 500);
    }, duration);
  }

  setLoading(loading: boolean): void {
    if (loading) {
      this.generateBtn.disabled = true;
      this.generateBtn.innerHTML = `${spinnerIcon} Generating...`;
    } else {
      this.generateBtn.disabled = false;
      this.generateBtn.textContent = 'Generate';
    }
  }

  setMicActive(active: boolean): void {
    this.micBtn.innerHTML = active ? micOnIcon : micOffIcon;
    this.micBtn.classList.toggle('sv-active', active);
  }

  setMusicActive(active: boolean): void {
    this.musicBtn.classList.toggle('sv-active', active);
  }

  // ── Private ──────────────────────────────────────────

  private showOverlay(): void {
    this.visible = true;
    this.panel.classList.remove('sv-hidden');
    if (this.settingsOpen) {
      this.settingsPanel.classList.remove('sv-hidden');
    }
    this.resetAutoHide();
  }

  private hideOverlay(): void {
    this.visible = false;
    this.panel.classList.add('sv-hidden');
    this.settingsPanel.classList.add('sv-hidden');
    clearTimeout(this.hideTimer);
  }

  private toggleOverlay(): void {
    if (this.visible) {
      this.hideOverlay();
    } else {
      this.showOverlay();
    }
  }

  private toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
    this.settingsPanel.classList.toggle('sv-hidden', !this.settingsOpen);
  }

  private resetAutoHide(): void {
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hideOverlay(), AUTO_HIDE_MS);
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}

// ── Helpers ──────────────────────────────────────────────

function el(tag: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

// ── SVG icons (inline, no external deps) ────────────────

const micOffIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="1" y1="1" x2="23" y2="23"/>
  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/>
  <line x1="12" y1="19" x2="12" y2="23"/>
  <line x1="8" y1="23" x2="16" y2="23"/>
</svg>`;

const micOnIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
  <line x1="12" y1="19" x2="12" y2="23"/>
  <line x1="8" y1="23" x2="16" y2="23"/>
</svg>`;

const musicIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M9 18V5l12-2v13"/>
  <circle cx="6" cy="18" r="3"/>
  <circle cx="18" cy="16" r="3"/>
</svg>`;

const gearIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="3"/>
  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
</svg>`;

const spinnerIcon = `<svg class="sv-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>`;

// ── CSS ──────────────────────────────────────────────────

const CSS = `
/* ── Theme variables ─────────────────────────────── */
:root {
  --sv-bg: rgba(10, 10, 20, 0.65);
  --sv-bg-solid: rgba(10, 10, 20, 0.85);
  --sv-border: rgba(255, 255, 255, 0.08);
  --sv-text: rgba(255, 255, 255, 0.92);
  --sv-text-dim: rgba(255, 255, 255, 0.5);
  --sv-accent: #7b5cff;
  --sv-accent-glow: rgba(123, 92, 255, 0.35);
  --sv-radius: 16px;
  --sv-radius-sm: 10px;
  --sv-transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  --sv-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* ── Tap zone (invisible, receives clicks for toggle) ── */
.sv-tap-zone {
  position: absolute;
  inset: 0;
  z-index: 0;
}

/* ── Main panel ─────────────────────────────────── */
.sv-panel {
  position: absolute;
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  left: 50%;
  transform: translateX(-50%);
  width: min(420px, calc(100% - 32px));
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 20px;
  background: var(--sv-bg);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  border: 1px solid var(--sv-border);
  border-radius: var(--sv-radius);
  font-family: var(--sv-font);
  color: var(--sv-text);
  z-index: 2;
  transition: opacity var(--sv-transition), transform var(--sv-transition);
}

.sv-panel.sv-hidden {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
  pointer-events: none !important;
}

/* ── Inputs ──────────────────────────────────────── */
.sv-input {
  width: 100%;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--sv-border);
  border-radius: var(--sv-radius-sm);
  color: var(--sv-text);
  font-family: var(--sv-font);
  font-size: 15px;
  outline: none;
  transition: border-color var(--sv-transition), background var(--sv-transition);
  -webkit-appearance: none;
}
.sv-input::placeholder {
  color: var(--sv-text-dim);
}
.sv-input:focus {
  border-color: var(--sv-accent);
  background: rgba(255, 255, 255, 0.09);
}

/* ── Buttons ─────────────────────────────────────── */
.sv-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  cursor: pointer;
  font-family: var(--sv-font);
  font-size: 14px;
  color: var(--sv-text);
  background: transparent;
  transition: background var(--sv-transition), transform 0.15s ease, box-shadow var(--sv-transition);
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}
.sv-btn:active {
  transform: scale(0.96);
}

.sv-btn-primary {
  width: 100%;
  padding: 14px 20px;
  background: var(--sv-accent);
  border-radius: var(--sv-radius-sm);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
  box-shadow: 0 0 20px var(--sv-accent-glow);
}
.sv-btn-primary:hover {
  background: #8d72ff;
}
.sv-btn-primary:disabled {
  opacity: 0.6;
  cursor: default;
  transform: none;
}

/* ── Preset buttons ──────────────────────────────── */
.sv-preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.sv-btn-preset {
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 20px;
  font-size: 13px;
  min-height: 36px;
  border: 1px solid var(--sv-border);
}
.sv-btn-preset:hover {
  background: rgba(255, 255, 255, 0.13);
}

/* ── Slider ──────────────────────────────────────── */
.sv-slider-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sv-slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}
.sv-slider-title {
  color: var(--sv-text-dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 500;
  font-size: 11px;
}
.sv-slider-value {
  font-variant-numeric: tabular-nums;
  color: var(--sv-text);
  font-size: 13px;
}

.sv-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  outline: none;
}
.sv-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--sv-accent);
  box-shadow: 0 0 10px var(--sv-accent-glow);
  cursor: pointer;
  border: 2px solid rgba(255,255,255,0.2);
}
.sv-slider::-moz-range-thumb {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--sv-accent);
  box-shadow: 0 0 10px var(--sv-accent-glow);
  cursor: pointer;
  border: 2px solid rgba(255,255,255,0.2);
}

/* ── Toolbar (mic + settings) ────────────────────── */
.sv-toolbar {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 4px;
}
.sv-btn-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid var(--sv-border);
  color: var(--sv-text-dim);
}
.sv-btn-icon:hover {
  background: rgba(255, 255, 255, 0.13);
  color: var(--sv-text);
}
.sv-btn-icon.sv-active {
  background: var(--sv-accent);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 0 14px var(--sv-accent-glow);
}

/* ── Settings panel ──────────────────────────────── */
.sv-settings {
  position: absolute;
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  right: 16px;
  width: min(320px, calc(100% - 32px));
  padding: 20px;
  background: var(--sv-bg-solid);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  border: 1px solid var(--sv-border);
  border-radius: var(--sv-radius);
  font-family: var(--sv-font);
  color: var(--sv-text);
  z-index: 3;
  transition: opacity var(--sv-transition), transform var(--sv-transition);
}
.sv-settings.sv-hidden {
  opacity: 0;
  transform: translateY(12px);
  pointer-events: none !important;
}
.sv-settings-title {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--sv-text-dim);
  margin-bottom: 14px;
}
.sv-apikey-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sv-label {
  font-size: 13px;
  color: var(--sv-text-dim);
}
.sv-input-key {
  font-size: 14px;
  letter-spacing: 0.04em;
}

/* ── Toast ───────────────────────────────────────── */
.sv-toast {
  display: inline-block;
  padding: 12px 24px;
  background: var(--sv-bg-solid);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--sv-border);
  border-radius: var(--sv-radius-sm);
  color: var(--sv-text);
  font-family: var(--sv-font);
  font-size: 14px;
  white-space: nowrap;
  opacity: 0;
  transform: translateY(10px);
  transition: opacity 0.3s ease, transform 0.3s ease;
  margin-top: 8px;
}
.sv-toast.sv-toast-visible {
  opacity: 1;
  transform: translateY(0);
}

/* ── Spinner animation ───────────────────────────── */
.sv-spinner {
  animation: sv-spin 0.8s linear infinite;
  flex-shrink: 0;
}
@keyframes sv-spin {
  to { transform: rotate(360deg); }
}

/* ── Responsive: stack settings below panel on narrow screens ── */
@media (max-width: 500px) {
  .sv-settings {
    right: 50%;
    transform: translateX(50%);
    bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  }
  .sv-settings.sv-hidden {
    transform: translateX(50%) translateY(12px);
  }
  .sv-panel {
    /* nudge panel up when settings might appear below */
  }
}
`;
