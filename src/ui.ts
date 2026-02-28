// Overlay UI — glassmorphism controls, settings panel, toast notifications

const STORAGE_KEY = 'shader-visuals-api-key';
const AUTO_HIDE_MS = 5000;

const PRESETS = ['Cosmic Ocean', 'Neon Grid', 'Forest Fire', 'Crystal Cave', 'Void'] as const;

export class UI {
  onGenerate: ((scene: string, vibe: string) => void) | null = null;
  onPresetSelect: ((name: string) => void) | null = null;
  onIntensityChange: ((value: number) => void) | null = null;
  onCoherenceChange: ((value: number) => void) | null = null;
  onMicToggle: (() => void) | null = null;
  onMusicFile: ((file: File) => void) | null = null;
  onApiKeyChange: ((key: string) => void) | null = null;
  onCameraReset: (() => void) | null = null;
  onFormChange: ((value: number) => void) | null = null;
  onDownload: (() => void) | null = null;
  onPanoramaToggle: ((enabled: boolean) => void) | null = null;
  onJourneyToggle: ((enabled: boolean) => void) | null = null;

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
  private coherenceSlider!: HTMLInputElement;
  private coherenceLabel!: HTMLElement;

  private downloadBtn!: HTMLButtonElement;
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

    // Generate row: button + 360° toggle
    const generateRow = el('div', 'sv-generate-row');

    this.generateBtn = el('button', 'sv-btn sv-btn-primary') as HTMLButtonElement;
    this.generateBtn.textContent = 'Generate';
    this.generateBtn.addEventListener('click', () => {
      this.onGenerate?.(this.sceneInput.value.trim(), this.vibeInput.value.trim());
    });

    const panoBtn = el('button', 'sv-btn sv-btn-pano') as HTMLButtonElement;
    panoBtn.textContent = '360°';
    panoBtn.title = 'Toggle 360° panorama mode';
    let panoActive = localStorage.getItem('shader-visuals-panorama') === 'true';
    if (panoActive) panoBtn.classList.add('sv-active');
    panoBtn.addEventListener('click', () => {
      panoActive = !panoActive;
      panoBtn.classList.toggle('sv-active', panoActive);
      localStorage.setItem('shader-visuals-panorama', String(panoActive));
      this.onPanoramaToggle?.(panoActive);
    });

    // Journey mode toggle
    const journeyBtn = el('button', 'sv-btn sv-btn-pano') as HTMLButtonElement;
    journeyBtn.textContent = '∞';
    journeyBtn.title = 'Journey mode — continuous scene generation';
    let journeyActive = false;
    journeyBtn.addEventListener('click', () => {
      journeyActive = !journeyActive;
      journeyBtn.classList.toggle('sv-active', journeyActive);
      this.onJourneyToggle?.(journeyActive);
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

    // Coherence slider
    const coherenceGroup = el('div', 'sv-slider-group');
    const coherenceHeader = el('div', 'sv-slider-header');
    const coherenceTitle = el('span', 'sv-slider-title');
    coherenceTitle.textContent = 'Coherence';
    this.coherenceLabel = el('span', 'sv-slider-value');
    this.coherenceLabel.textContent = '80%';
    coherenceHeader.appendChild(coherenceTitle);
    coherenceHeader.appendChild(this.coherenceLabel);

    this.coherenceSlider = el('input', 'sv-slider') as HTMLInputElement;
    this.coherenceSlider.type = 'range';
    this.coherenceSlider.min = '0';
    this.coherenceSlider.max = '100';
    this.coherenceSlider.value = '80';
    this.coherenceSlider.addEventListener('input', () => {
      const v = parseInt(this.coherenceSlider.value, 10);
      this.coherenceLabel.textContent = `${v}%`;
      this.onCoherenceChange?.(v / 100);
      this.resetAutoHide();
    });

    coherenceGroup.appendChild(coherenceHeader);
    coherenceGroup.appendChild(this.coherenceSlider);

    // Form slider (0=grid/lines, 1=scattered points)
    const formGroup = el('div', 'sv-slider-group');
    const formHeader = el('div', 'sv-slider-header');
    const formTitle = el('span', 'sv-slider-title');
    formTitle.textContent = 'Form';
    const formLabel = el('span', 'sv-slider-value');
    formLabel.textContent = '0%';
    formHeader.appendChild(formTitle);
    formHeader.appendChild(formLabel);

    const formSlider = el('input', 'sv-slider') as HTMLInputElement;
    formSlider.type = 'range';
    formSlider.min = '0';
    formSlider.max = '100';
    formSlider.value = '0';
    const savedForm = localStorage.getItem('shader-visuals-form');
    if (savedForm !== null) {
      formSlider.value = String(Math.round(parseFloat(savedForm) * 100));
      formLabel.textContent = `${formSlider.value}%`;
    }
    formSlider.addEventListener('input', () => {
      const v = parseInt(formSlider.value, 10);
      formLabel.textContent = `${v}%`;
      this.onFormChange?.(v / 100);
      this.resetAutoHide();
    });

    formGroup.appendChild(formHeader);
    formGroup.appendChild(formSlider);

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

    // Download button
    this.downloadBtn = el('button', 'sv-btn sv-btn-icon') as HTMLButtonElement;
    this.downloadBtn.innerHTML = downloadIcon;
    this.downloadBtn.title = 'Download generated image';
    this.downloadBtn.style.display = 'none'; // hidden until an image is generated
    this.downloadBtn.addEventListener('click', () => {
      this.onDownload?.();
      this.resetAutoHide();
    });

    this.settingsBtn = el('button', 'sv-btn sv-btn-icon') as HTMLButtonElement;
    this.settingsBtn.innerHTML = gearIcon;
    this.settingsBtn.title = 'Settings';
    this.settingsBtn.addEventListener('click', () => {
      this.toggleSettings();
      this.resetAutoHide();
    });

    // Camera reset button
    const resetBtn = el('button', 'sv-btn sv-btn-icon') as HTMLButtonElement;
    resetBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`;
    resetBtn.title = 'Reset camera';
    resetBtn.addEventListener('click', () => {
      this.onCameraReset?.();
      this.resetAutoHide();
    });

    toolbar.appendChild(this.micBtn);
    toolbar.appendChild(this.musicBtn);
    toolbar.appendChild(this.fileInput);
    toolbar.appendChild(this.downloadBtn);
    toolbar.appendChild(resetBtn);
    toolbar.appendChild(this.settingsBtn);

    // Settings panel
    this.settingsPanel = el('div', 'sv-settings');
    const settingsTitle = el('div', 'sv-settings-title');
    settingsTitle.textContent = 'Settings';

    // Close button for settings
    const settingsClose = el('button', 'sv-btn sv-btn-close') as HTMLButtonElement;
    settingsClose.textContent = '✕';
    settingsClose.addEventListener('click', () => {
      this.settingsOpen = false;
      this.settingsPanel.classList.add('sv-hidden');
    });
    settingsTitle.appendChild(settingsClose);
    const apiKeyGroup = el('div', 'sv-apikey-group');
    const apiKeyLabel = el('label', 'sv-label');
    apiKeyLabel.textContent = 'OpenAI API Key';
    this.apiKeyInput = el('input', 'sv-input sv-input-key') as HTMLInputElement;
    this.apiKeyInput.type = 'password';
    this.apiKeyInput.placeholder = 'sk-...';
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

    // RunPod API Key
    const runpodGroup = el('div', 'sv-apikey-group');
    const runpodLabel = el('label', 'sv-label');
    runpodLabel.textContent = 'RunPod API Key';
    const runpodInput = el('input', 'sv-input sv-input-key') as HTMLInputElement;
    runpodInput.type = 'password';
    runpodInput.placeholder = 'rp_...';
    runpodInput.autocomplete = 'off';
    runpodInput.value = localStorage.getItem('shader-visuals-runpod-key') ?? '';
    runpodInput.addEventListener('input', () => {
      localStorage.setItem('shader-visuals-runpod-key', runpodInput.value.trim());
      this.resetAutoHide();
    });
    runpodGroup.appendChild(runpodLabel);
    runpodGroup.appendChild(runpodInput);

    this.settingsPanel.appendChild(settingsTitle);
    this.settingsPanel.appendChild(apiKeyGroup);
    this.settingsPanel.appendChild(runpodGroup);

    // Assemble panel
    generateRow.appendChild(this.generateBtn);
    generateRow.appendChild(panoBtn);
    generateRow.appendChild(journeyBtn);

    this.panel.appendChild(this.sceneInput);
    this.panel.appendChild(this.vibeInput);
    this.panel.appendChild(generateRow);
    this.panel.appendChild(presetRow);
    this.panel.appendChild(sliderGroup);
    this.panel.appendChild(coherenceGroup);
    this.panel.appendChild(formGroup);
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

  /** Show clickable segment list. Clicking a segment highlights it on the scene. */
  showSegmentPanel(
    labels: string[],
    onHighlight: (categoryIndex: number | null) => void,
  ): void {
    // Remove old panel if exists
    const old = document.getElementById('sv-segment-panel');
    if (old) old.remove();

    const panel = el('div', 'sv-segment-panel');
    panel.id = 'sv-segment-panel';
    panel.style.cssText = `
      position:fixed; bottom:80px; left:10px; z-index:1001;
      background:rgba(0,0,0,0.8); backdrop-filter:blur(10px);
      border-radius:12px; padding:10px 12px; max-width:280px;
      font-size:12px; color:#fff; pointer-events:auto;
      touch-action:none; user-select:none;
    `;

    // Make draggable
    let dragX = 0, dragY = 0, isDragging = false;
    const onDragStart = (x: number, y: number) => {
      dragX = x - panel.offsetLeft;
      dragY = y - panel.offsetTop;
      isDragging = true;
    };
    const onDragMove = (x: number, y: number) => {
      if (!isDragging) return;
      panel.style.left = `${x - dragX}px`;
      panel.style.top = `${y - dragY}px`;
      panel.style.bottom = 'auto';
    };
    const onDragEnd = () => { isDragging = false; };

    panel.addEventListener('mousedown', (e) => onDragStart(e.clientX, e.clientY));
    document.addEventListener('mousemove', (e) => onDragMove(e.clientX, e.clientY));
    document.addEventListener('mouseup', onDragEnd);
    panel.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      onDragStart(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const t = e.touches[0];
      onDragMove(t.clientX, t.clientY);
    });
    document.addEventListener('touchend', onDragEnd);

    const title = el('div', '');
    title.style.cssText = 'font-weight:bold; margin-bottom:4px; font-size:12px;';
    title.textContent = `Segments (${labels.length})`;
    panel.appendChild(title);

    const catNames = ['🫀 Bass/Subject', '🌿 Mid/Organic', '✨ High/Sky', '🌊 Beat/Ground', '🏗️ Mid/Structure', '🧱 Ambient'];
    const catColors = ['#ff6b6b', '#51cf66', '#74c0fc', '#ffd43b', '#b197fc', '#868e96'];

    // Group labels by category
    const byCat: Record<number, string[]> = {};
    for (const lbl of labels) {
      const match = lbl.match(/→cat(\d)/);
      if (match) {
        const cat = parseInt(match[1]);
        if (!byCat[cat]) byCat[cat] = [];
        const name = lbl.split('→')[0];
        byCat[cat].push(name);
      }
    }

    let activeBtn: HTMLElement | null = null;

    for (let cat = 0; cat < 6; cat++) {
      const items = byCat[cat];
      if (!items || items.length === 0) continue;

      const row = el('div', '');
      row.style.cssText = `
        display:flex; align-items:center; gap:6px; padding:3px 6px;
        border-radius:6px; cursor:pointer; margin:2px 0;
        transition: background 0.15s;
      `;

      const dot = el('span', '');
      dot.style.cssText = `width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${catColors[cat]}`;

      const text = el('span', '');
      text.style.cssText = 'flex:1; opacity:0.9;';
      text.textContent = `${catNames[cat]}: ${items.join(', ')}`;

      row.appendChild(dot);
      row.appendChild(text);

      const toggleHighlight = () => {
        if (activeBtn === row) {
          row.style.background = '';
          activeBtn = null;
          onHighlight(null);
        } else {
          if (activeBtn) activeBtn.style.background = '';
          row.style.background = `${catColors[cat]}33`;
          activeBtn = row;
          onHighlight(cat);
        }
      };

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleHighlight();
      });
      // iOS touch support
      let touchMoved = false;
      row.addEventListener('touchstart', () => { touchMoved = false; }, { passive: true });
      row.addEventListener('touchmove', () => { touchMoved = true; }, { passive: true });
      row.addEventListener('touchend', (e) => {
        if (!touchMoved) {
          e.preventDefault();
          e.stopPropagation();
          toggleHighlight();
        }
      });

      panel.appendChild(row);
    }

    // Close button
    const close = el('div', '');
    close.style.cssText = 'text-align:right; margin-top:4px; cursor:pointer; opacity:0.5; font-size:10px;';
    close.textContent = '✕ close';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      onHighlight(null);
      panel.remove();
    });
    panel.appendChild(close);

    document.body.appendChild(panel);
  }

  setLoading(loading: boolean, message?: string): void {
    if (loading) {
      this.generateBtn.disabled = true;
      this.generateBtn.innerHTML = `${spinnerIcon} ${message || 'Generating...'}`;
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

  setDownloadVisible(visible: boolean): void {
    this.downloadBtn.style.display = visible ? '' : 'none';
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

const downloadIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

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

.sv-generate-row {
  display: flex;
  gap: 8px;
}
.sv-generate-row .sv-btn-primary {
  flex: 1;
}
.sv-btn-pano {
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.07);
  border-radius: var(--sv-radius-sm);
  font-size: 14px;
  font-weight: 600;
  border: 1px solid var(--sv-border);
  white-space: nowrap;
}
.sv-btn-pano:hover {
  background: rgba(255, 255, 255, 0.13);
}
.sv-btn-pano.sv-active {
  background: var(--sv-accent);
  border-color: transparent;
  box-shadow: 0 0 14px var(--sv-accent-glow);
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
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sv-btn-close {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255,255,255,0.1);
  font-size: 14px;
  padding: 0;
  line-height: 1;
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
