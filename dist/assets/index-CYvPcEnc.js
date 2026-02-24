var S=Object.defineProperty;var k=(r,t,e)=>t in r?S(r,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):r[t]=e;var n=(r,t,e)=>k(r,typeof t!="symbol"?t+"":t,e);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))s(i);new MutationObserver(i=>{for(const o of i)if(o.type==="childList")for(const l of o.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&s(l)}).observe(document,{childList:!0,subtree:!0});function e(i){const o={};return i.integrity&&(o.integrity=i.integrity),i.referrerPolicy&&(o.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?o.credentials="include":i.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function s(i){if(i.ep)return;i.ep=!0;const o=e(i);fetch(i.href,o)}})();class C{constructor(){n(this,"ctx",null);n(this,"analyser",null);n(this,"source",null);n(this,"stream",null);n(this,"freqData",new Uint8Array(0));n(this,"active",!1);n(this,"failed",!1);n(this,"rollingAvg",0);n(this,"beat",0);n(this,"smoothBass",0);n(this,"smoothMid",0);n(this,"smoothHigh",0);n(this,"smooth",.8)}async init(){try{this.stream=await navigator.mediaDevices.getUserMedia({audio:!0}),this.ctx=new AudioContext,this.analyser=this.ctx.createAnalyser(),this.analyser.fftSize=2048,this.analyser.smoothingTimeConstant=.4,this.source=this.ctx.createMediaStreamSource(this.stream),this.source.connect(this.analyser),this.freqData=new Uint8Array(this.analyser.frequencyBinCount)}catch(t){console.warn("AudioEngine: mic access denied or unavailable",t),this.failed=!0}}start(){this.failed||!this.ctx||(this.ctx.state==="suspended"&&this.ctx.resume(),this.active=!0)}stop(){this.active=!1,this.ctx&&this.ctx.state==="running"&&this.ctx.suspend()}get isActive(){return this.active}getUniforms(){if(!this.active||!this.analyser||!this.ctx)return{u_bass:0,u_mid:0,u_high:0,u_beat:0};this.analyser.getByteFrequencyData(this.freqData);const t=this.ctx.sampleRate,e=this.analyser.frequencyBinCount,s=t/(e*2),i=Math.floor(20/s),o=Math.min(Math.floor(250/s),e-1),l=o+1,u=Math.min(Math.floor(2e3/s),e-1),h=u+1,v=Math.min(Math.floor(16e3/s),e-1),f=m(this.freqData,i,o),c=m(this.freqData,l,u),d=m(this.freqData,h,v);return this.smoothBass=this.smoothBass*this.smooth+f*(1-this.smooth),this.smoothMid=this.smoothMid*this.smooth+c*(1-this.smooth),this.smoothHigh=this.smoothHigh*this.smooth+d*(1-this.smooth),this.rollingAvg=this.rollingAvg*.95+this.smoothBass*.05,this.smoothBass>this.rollingAvg*1.5&&(this.beat=1),this.beat*=.9,{u_bass:p(this.smoothBass),u_mid:p(this.smoothMid),u_high:p(this.smoothHigh),u_beat:p(this.beat)}}}function m(r,t,e){if(t>e||t>=r.length)return 0;let s=0;const i=Math.min(e,r.length-1);for(let o=t;o<=i;o++)s+=r[o];return s/((i-t+1)*255)}function p(r){return r<0?0:r>1?1:r}const b=`#version 300 es
in vec4 a_position;
void main() {
    gl_Position = a_position;
}
`,A=new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),L=["u_time","u_bass","u_mid","u_high","u_beat","u_intensity","u_resolution"];class E{constructor(){n(this,"gl",null);n(this,"vao",null);n(this,"compiledVertex",null);n(this,"current",null);n(this,"next",null);n(this,"crossfadeStart",0);n(this,"crossfadeDuration",0);n(this,"crossfading",!1);n(this,"onError",null)}init(t,e){const s=t.getContext("webgl2",{alpha:!1,antialias:!1});if(!s){this.onError?.("WebGL2 not supported");return}this.gl=s,t.addEventListener("webglcontextlost",i=>{i.preventDefault(),this.current=null,this.next=null,this.compiledVertex=null,this.vao=null}),t.addEventListener("webglcontextrestored",()=>{this.gl&&(this.setupGeometry(),this.compiledVertex=this.compileShader(s.VERTEX_SHADER,b))}),this.setupGeometry(),this.compiledVertex=this.compileShader(s.VERTEX_SHADER,b),this.compiledVertex&&(this.current=this.buildProgram(e),this.current||this.onError?.("Default shader failed to compile"),this.resize(),window.addEventListener("resize",()=>this.resize()))}loadShader(t){const e=this.buildProgram(t);return e?(this.disposeProgram(this.current),this.current=e,this.crossfading=!1,this.next=null,!0):!1}crossfadeTo(t,e=500){const s=this.buildProgram(t);return s?(this.crossfading&&this.next&&(this.disposeProgram(this.current),this.current=this.next),this.next=s,this.crossfadeDuration=e,this.crossfadeStart=performance.now(),this.crossfading=!0,!0):!1}render(t){const e=this.gl;if(!(!e||!this.current)){if(e.viewport(0,0,e.drawingBufferWidth,e.drawingBufferHeight),e.bindVertexArray(this.vao),this.crossfading&&this.next){const s=Math.min((performance.now()-this.crossfadeStart)/this.crossfadeDuration,1);e.enable(e.BLEND),e.blendFunc(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA),e.clearColor(0,0,0,1),e.clear(e.COLOR_BUFFER_BIT),this.drawWithProgram(this.current,t,1),this.drawWithProgram(this.next,t,s),e.disable(e.BLEND),s>=1&&(this.disposeProgram(this.current),this.current=this.next,this.next=null,this.crossfading=!1)}else e.disable(e.BLEND),e.clearColor(0,0,0,1),e.clear(e.COLOR_BUFFER_BIT),this.drawWithProgram(this.current,t,1);e.bindVertexArray(null)}}resize(){const t=this.gl;if(!t)return;const e=t.canvas,s=window.devicePixelRatio||1,i=e.clientWidth*s,o=e.clientHeight*s;(e.width!==i||e.height!==o)&&(e.width=i,e.height=o)}setupGeometry(){const t=this.gl;this.vao=t.createVertexArray(),t.bindVertexArray(this.vao);const e=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,e),t.bufferData(t.ARRAY_BUFFER,A,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null)}compileShader(t,e){const s=this.gl,i=s.createShader(t);if(!i)return this.onError?.("Failed to create shader object"),null;if(s.shaderSource(i,e),s.compileShader(i),!s.getShaderParameter(i,s.COMPILE_STATUS)){const o=s.getShaderInfoLog(i)||"Unknown compile error";return s.deleteShader(i),this.onError?.(o),null}return i}buildProgram(t){const e=this.gl;if(!e||!this.compiledVertex)return null;const s=this.compileShader(e.FRAGMENT_SHADER,t);if(!s)return null;const i=e.createProgram();if(!i)return e.deleteShader(s),this.onError?.("Failed to create program"),null;if(e.attachShader(i,this.compiledVertex),e.attachShader(i,s),e.bindAttribLocation(i,0,"a_position"),e.linkProgram(i),e.deleteShader(s),!e.getProgramParameter(i,e.LINK_STATUS)){const l=e.getProgramInfoLog(i)||"Unknown link error";return e.deleteProgram(i),this.onError?.(l),null}const o={};for(const l of L)o[l]=e.getUniformLocation(i,l);return o.u_alpha=e.getUniformLocation(i,"u_alpha"),{program:i,uniforms:o}}drawWithProgram(t,e,s){const i=this.gl;i.useProgram(t.program),t.uniforms.u_time!=null&&i.uniform1f(t.uniforms.u_time,e.u_time),t.uniforms.u_bass!=null&&i.uniform1f(t.uniforms.u_bass,e.u_bass),t.uniforms.u_mid!=null&&i.uniform1f(t.uniforms.u_mid,e.u_mid),t.uniforms.u_high!=null&&i.uniform1f(t.uniforms.u_high,e.u_high),t.uniforms.u_beat!=null&&i.uniform1f(t.uniforms.u_beat,e.u_beat),t.uniforms.u_intensity!=null&&i.uniform1f(t.uniforms.u_intensity,e.u_intensity),t.uniforms.u_resolution!=null&&i.uniform2f(t.uniforms.u_resolution,e.u_resolution[0],e.u_resolution[1]),s<1?(i.blendFunc(i.CONSTANT_ALPHA,i.ONE_MINUS_CONSTANT_ALPHA),i.blendColor(0,0,0,s)):i.blendFunc(i.SRC_ALPHA,i.ONE_MINUS_SRC_ALPHA),i.drawArrays(i.TRIANGLES,0,6)}disposeProgram(t){!t||!this.gl||this.gl.deleteProgram(t.program)}}const y="shader-visuals-api-key",I=5e3,P=["Cosmic Ocean","Neon Grid","Forest Fire","Crystal Cave","Void"];class T{constructor(){n(this,"onGenerate",null);n(this,"onPresetSelect",null);n(this,"onIntensityChange",null);n(this,"onMicToggle",null);n(this,"onApiKeyChange",null);n(this,"overlay");n(this,"toastEl");n(this,"panel");n(this,"settingsPanel");n(this,"generateBtn");n(this,"sceneInput");n(this,"vibeInput");n(this,"micBtn");n(this,"settingsBtn");n(this,"apiKeyInput");n(this,"intensitySlider");n(this,"intensityLabel");n(this,"hideTimer",0);n(this,"visible",!1);n(this,"settingsOpen",!1)}init(){this.injectStyles(),this.overlay=document.getElementById("overlay"),this.toastEl=document.getElementById("toast"),this.panel=a("div","sv-panel"),this.sceneInput=a("input","sv-input"),this.sceneInput.type="text",this.sceneInput.placeholder="describe a scene...",this.sceneInput.autocomplete="off",this.vibeInput=a("input","sv-input"),this.vibeInput.type="text",this.vibeInput.placeholder="set the vibe...",this.vibeInput.autocomplete="off",this.generateBtn=a("button","sv-btn sv-btn-primary"),this.generateBtn.textContent="Generate",this.generateBtn.addEventListener("click",()=>{this.onGenerate?.(this.sceneInput.value.trim(),this.vibeInput.value.trim())});const t=a("div","sv-preset-row");for(const c of P){const d=a("button","sv-btn sv-btn-preset");d.textContent=c,d.addEventListener("click",()=>{this.onPresetSelect?.(c),this.resetAutoHide()}),t.appendChild(d)}const e=a("div","sv-slider-group"),s=a("div","sv-slider-header"),i=a("span","sv-slider-title");i.textContent="Intensity",this.intensityLabel=a("span","sv-slider-value"),this.intensityLabel.textContent="50%",s.appendChild(i),s.appendChild(this.intensityLabel),this.intensitySlider=a("input","sv-slider"),this.intensitySlider.type="range",this.intensitySlider.min="0",this.intensitySlider.max="100",this.intensitySlider.value="50",this.intensitySlider.addEventListener("input",()=>{const c=parseInt(this.intensitySlider.value,10);this.intensityLabel.textContent=`${c}%`,this.onIntensityChange?.(c/100),this.resetAutoHide()}),e.appendChild(s),e.appendChild(this.intensitySlider);const o=a("div","sv-toolbar");this.micBtn=a("button","sv-btn sv-btn-icon"),this.micBtn.innerHTML=x,this.micBtn.title="Toggle microphone",this.micBtn.addEventListener("click",()=>{this.onMicToggle?.(),this.resetAutoHide()}),this.settingsBtn=a("button","sv-btn sv-btn-icon"),this.settingsBtn.innerHTML=M,this.settingsBtn.title="Settings",this.settingsBtn.addEventListener("click",()=>{this.toggleSettings(),this.resetAutoHide()}),o.appendChild(this.micBtn),o.appendChild(this.settingsBtn),this.settingsPanel=a("div","sv-settings");const l=a("div","sv-settings-title");l.textContent="Settings";const u=a("div","sv-apikey-group"),h=a("label","sv-label");h.textContent="Anthropic API Key",this.apiKeyInput=a("input","sv-input sv-input-key"),this.apiKeyInput.type="password",this.apiKeyInput.placeholder="sk-ant-...",this.apiKeyInput.autocomplete="off";const v=localStorage.getItem(y)??"";this.apiKeyInput.value=v,this.apiKeyInput.addEventListener("input",()=>{const c=this.apiKeyInput.value.trim();localStorage.setItem(y,c),this.onApiKeyChange?.(c),this.resetAutoHide()}),u.appendChild(h),u.appendChild(this.apiKeyInput),this.settingsPanel.appendChild(l),this.settingsPanel.appendChild(u),this.panel.appendChild(this.sceneInput),this.panel.appendChild(this.vibeInput),this.panel.appendChild(this.generateBtn),this.panel.appendChild(t),this.panel.appendChild(e),this.panel.appendChild(o),this.overlay.appendChild(this.panel),this.overlay.appendChild(this.settingsPanel),this.overlay.addEventListener("click",c=>{if(c.target.closest(".sv-panel, .sv-settings")){this.resetAutoHide();return}this.toggleOverlay()}),this.panel.style.pointerEvents="auto",this.settingsPanel.style.pointerEvents="auto";const f=a("div","sv-tap-zone");f.style.pointerEvents="auto",this.overlay.insertBefore(f,this.overlay.firstChild),this.visible=!1,this.panel.classList.add("sv-hidden"),this.settingsPanel.classList.add("sv-hidden"),setTimeout(()=>this.showOverlay(),300)}showToast(t,e=3e3){const s=a("div","sv-toast");s.textContent=t,this.toastEl.appendChild(s),requestAnimationFrame(()=>s.classList.add("sv-toast-visible")),setTimeout(()=>{s.classList.remove("sv-toast-visible"),s.addEventListener("transitionend",()=>s.remove()),setTimeout(()=>s.remove(),500)},e)}setLoading(t){t?(this.generateBtn.disabled=!0,this.generateBtn.innerHTML=`${z} Generating...`):(this.generateBtn.disabled=!1,this.generateBtn.textContent="Generate")}setMicActive(t){this.micBtn.innerHTML=t?B:x,this.micBtn.classList.toggle("sv-active",t)}showOverlay(){this.visible=!0,this.panel.classList.remove("sv-hidden"),this.settingsOpen&&this.settingsPanel.classList.remove("sv-hidden"),this.resetAutoHide()}hideOverlay(){this.visible=!1,this.panel.classList.add("sv-hidden"),this.settingsPanel.classList.add("sv-hidden"),clearTimeout(this.hideTimer)}toggleOverlay(){this.visible?this.hideOverlay():this.showOverlay()}toggleSettings(){this.settingsOpen=!this.settingsOpen,this.settingsPanel.classList.toggle("sv-hidden",!this.settingsOpen)}resetAutoHide(){clearTimeout(this.hideTimer),this.hideTimer=window.setTimeout(()=>this.hideOverlay(),I)}injectStyles(){const t=document.createElement("style");t.textContent=F,document.head.appendChild(t)}}function a(r,t){const e=document.createElement(r);return t&&(e.className=t),e}const x=`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="1" y1="1" x2="23" y2="23"/>
  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/>
  <line x1="12" y1="19" x2="12" y2="23"/>
  <line x1="8" y1="23" x2="16" y2="23"/>
</svg>`,B=`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
  <line x1="12" y1="19" x2="12" y2="23"/>
  <line x1="8" y1="23" x2="16" y2="23"/>
</svg>`,M=`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="3"/>
  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
</svg>`,z='<svg class="sv-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>',F=`
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
`,O="https://api.anthropic.com/v1/messages",R="claude-sonnet-4-20250514",H=`You are a GLSL shader generator. Output ONLY valid WebGL2 GLSL fragment shader code. No explanation, no markdown — just the raw GLSL code inside a single \`\`\`glsl code block.

Requirements for every shader you generate:
- First line must be: #version 300 es
- Must have: precision highp float;
- Must declare these uniforms exactly:
  uniform float u_time;
  uniform float u_bass;
  uniform float u_mid;
  uniform float u_high;
  uniform float u_beat;
  uniform float u_intensity;
  uniform vec2 u_resolution;
- Must output to: out vec4 fragColor;
- Use gl_FragCoord for pixel position
- Normalize coordinates: vec2 uv = gl_FragCoord.xy / u_resolution;

Uniform ranges:
- u_time: elapsed seconds (0 to infinity)
- u_bass: low frequency energy (0.0 to 1.0) — kick drums, bass
- u_mid: mid frequency energy (0.0 to 1.0) — vocals, guitars
- u_high: high frequency energy (0.0 to 1.0) — cymbals, hi-hats
- u_beat: detected beat pulse (0.0 to 1.0, decays after each beat)
- u_intensity: user-controlled intensity multiplier (0.0 to 1.0)
- u_resolution: canvas size in pixels

Make shaders that are visually stunning, smooth, and reactive to the audio uniforms. Multiply audio reactivity by u_intensity. Use interesting math — sin, cos, noise, polar coordinates, fractals, etc.`;function U(r){const t=r.match(/```glsl\s*\n([\s\S]*?)```/);if(t)return t[1].trim();const e=r.match(/```\s*\n([\s\S]*?)```/);if(e)return e[1].trim();const s=r.trim();if(s.startsWith("#version"))return s;throw new Error("No valid GLSL code found in LLM response")}async function G(r,t,e,s){let i=`Scene: ${r}
Vibe: ${t}

Generate a fragment shader that visualizes this scene with this vibe. Make it react to audio through the uniforms.`;s&&(i+=`

The previous shader had a compile error. Fix it:
${s}`);const o=await fetch(O,{method:"POST",headers:{"x-api-key":e,"anthropic-version":"2023-06-01","content-type":"application/json","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:R,max_tokens:4096,system:H,messages:[{role:"user",content:i}]})});if(!o.ok){const h=await o.text();throw o.status===401?new Error("Invalid API key. Check your Anthropic API key in settings."):o.status===429?new Error("Rate limited. Wait a moment and try again."):new Error(`API error (${o.status}): ${h}`)}const u=(await o.json()).content?.[0]?.text;if(!u)throw new Error("Empty response from Claude API");return U(u)}async function _(r,t,e,s){return G(r,t,e,s)}const g=[{name:"Cosmic Ocean",description:"Blue/purple fluid simulation — bass drives wave amplitude",source:`#version 300 es
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_intensity;
uniform vec2 u_resolution;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= u_resolution.x / u_resolution.y;

    float t = u_time * 0.3;
    float bass = u_bass * u_intensity;
    float mid = u_mid * u_intensity;

    // Layered ocean waves driven by bass
    float wave = 0.0;
    for (float i = 1.0; i < 6.0; i++) {
        float freq = i * 1.5;
        float amp = (0.5 / i) * (0.3 + bass * 0.7);
        wave += sin(p.x * freq + t * i * 0.4 + sin(t * 0.2 * i)) * amp;
        wave += cos(p.y * freq * 0.8 + t * i * 0.3) * amp * 0.5;
    }

    float depth = p.y + wave * 0.3;

    // Bioluminescent colors
    vec3 deep = vec3(0.02, 0.01, 0.08);
    vec3 mid_col = vec3(0.05, 0.1, 0.4);
    vec3 surface = vec3(0.1, 0.3, 0.7);
    vec3 glow = vec3(0.3, 0.1, 0.8);

    float zone = smoothstep(-1.0, 1.0, depth);
    vec3 col = mix(surface, deep, zone);
    col = mix(col, mid_col, smoothstep(0.3, 0.6, zone));

    // Bioluminescent particles
    float sparkle = 0.0;
    for (float i = 0.0; i < 8.0; i++) {
        vec2 sp = vec2(
            sin(i * 3.14 + t * 0.5) * 0.6,
            cos(i * 2.17 + t * 0.3) * 0.8 + wave * 0.2
        );
        float d = length(p - sp);
        sparkle += (0.003 + mid * 0.005) / (d + 0.01);
    }
    col += glow * sparkle * 0.3;

    // Beat flash
    col += vec3(0.1, 0.05, 0.3) * u_beat * u_intensity;

    // High frequency shimmer on surface
    float shimmer = sin(p.x * 30.0 + t * 5.0) * sin(p.y * 20.0 + t * 3.0);
    col += vec3(0.1, 0.2, 0.5) * shimmer * u_high * u_intensity * 0.2 * (1.0 - zone);

    fragColor = vec4(col, 1.0);
}`},{name:"Neon Grid",description:"Synthwave retro grid — beat pulses the grid lines",source:`#version 300 es
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_intensity;
uniform vec2 u_resolution;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= u_resolution.x / u_resolution.y;

    float t = u_time;
    float beat = u_beat * u_intensity;
    float bass = u_bass * u_intensity;

    // Sky gradient
    vec3 col = mix(
        vec3(0.02, 0.0, 0.08),
        vec3(0.15, 0.0, 0.2),
        uv.y
    );

    // Sun
    float sunY = 0.3;
    float sunDist = length(vec2(p.x, p.y - sunY));
    vec3 sunCol = mix(vec3(1.0, 0.3, 0.6), vec3(1.0, 0.8, 0.2), uv.y);
    col += sunCol * smoothstep(0.35, 0.0, sunDist) * 0.8;
    // Sun horizontal lines
    float sunLines = step(0.0, sin(p.y * 40.0 + t * 2.0));
    col *= mix(1.0, sunLines * 0.5 + 0.5, smoothstep(0.35, 0.1, sunDist) * step(p.y, sunY));

    // Grid floor
    if (p.y < 0.0) {
        // Perspective projection
        float z = -0.5 / (p.y - 0.001);
        float x = p.x * z;
        float scroll = t * 2.0 + bass * 3.0;

        // Grid lines
        float gridX = abs(fract(x * 0.5) - 0.5);
        float gridZ = abs(fract(z * 0.3 + scroll * 0.3) - 0.5);

        float lineWidth = 0.02 + beat * 0.03;
        float lineX = smoothstep(lineWidth, 0.0, gridX);
        float lineZ = smoothstep(lineWidth, 0.0, gridZ);
        float grid = max(lineX, lineZ);

        // Grid glow color — pink/cyan
        vec3 gridCol = mix(
            vec3(0.0, 0.8, 1.0),
            vec3(1.0, 0.2, 0.8),
            sin(z * 0.5 + t) * 0.5 + 0.5
        );

        // Fade with distance
        float fog = exp(-z * 0.15);
        grid *= fog;

        // Beat pulse brightness
        float pulse = 1.0 + beat * 2.0;
        col += gridCol * grid * (0.5 + bass * 0.5) * pulse;

        // Horizon glow
        float horizonGlow = exp(-abs(p.y) * 8.0);
        col += vec3(1.0, 0.2, 0.6) * horizonGlow * 0.3;
    }

    // High-frequency stars
    float stars = 0.0;
    for (float i = 0.0; i < 20.0; i++) {
        vec2 starPos = vec2(
            fract(sin(i * 127.1) * 311.7) * 2.0 - 1.0,
            fract(sin(i * 269.5) * 183.3) * 0.8 + 0.2
        );
        starPos.x *= u_resolution.x / u_resolution.y;
        float d = length(p - starPos);
        float twinkle = sin(t * 3.0 + i * 5.0) * 0.5 + 0.5;
        stars += (0.001 + u_high * u_intensity * 0.002) / (d + 0.005) * twinkle;
    }
    col += vec3(0.8, 0.8, 1.0) * stars * 0.15;

    // Scanlines
    col *= 0.95 + 0.05 * sin(gl_FragCoord.y * 1.5);

    fragColor = vec4(col, 1.0);
}`},{name:"Forest Fire",description:"Organic fire particles — mid frequencies drive flame dance",source:`#version 300 es
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_intensity;
uniform vec2 u_resolution;

out vec4 fragColor;

// Hash-based pseudo-noise
float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = p * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= u_resolution.x / u_resolution.y;

    float t = u_time;
    float mid = u_mid * u_intensity;
    float bass = u_bass * u_intensity;
    float beat = u_beat * u_intensity;

    // Fire shape — rises from bottom
    vec2 fireUV = vec2(p.x * 0.8, p.y + 0.5);

    // Turbulent noise for flame
    float n1 = fbm(fireUV * 3.0 + vec2(0.0, -t * 1.5 - mid * 2.0));
    float n2 = fbm(fireUV * 5.0 + vec2(t * 0.3, -t * 2.0));
    float n3 = fbm(fireUV * 8.0 + vec2(-t * 0.5, -t * 3.0 - mid));

    float flame = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;

    // Flame envelope — narrow at top, wide at bottom
    float envelope = smoothstep(1.2, -0.5, fireUV.y);
    envelope *= smoothstep(0.8 + bass * 0.3, 0.0, abs(fireUV.x));

    float intensity = flame * envelope;
    intensity = smoothstep(0.1, 0.9, intensity);

    // Boost with beat
    intensity += beat * 0.3 * envelope;

    // Fire color ramp
    vec3 col = vec3(0.0);
    col = mix(col, vec3(0.5, 0.0, 0.0), smoothstep(0.0, 0.2, intensity));      // dark red
    col = mix(col, vec3(0.9, 0.2, 0.0), smoothstep(0.2, 0.4, intensity));      // orange
    col = mix(col, vec3(1.0, 0.6, 0.0), smoothstep(0.4, 0.65, intensity));     // yellow-orange
    col = mix(col, vec3(1.0, 0.9, 0.4), smoothstep(0.65, 0.85, intensity));    // bright yellow
    col = mix(col, vec3(1.0, 1.0, 0.9), smoothstep(0.85, 1.0, intensity));     // white core

    // Ember particles
    float embers = 0.0;
    for (float i = 0.0; i < 15.0; i++) {
        float seed = hash(vec2(i, i * 0.7));
        vec2 ep = vec2(
            sin(seed * 20.0 + t * (0.3 + seed * 0.5)) * (0.3 + seed * 0.4),
            mod(seed * 5.0 + t * (0.5 + seed * 0.8), 3.0) - 1.0
        );
        float d = length(p - ep);
        float flicker = sin(t * 10.0 * seed) * 0.5 + 0.5;
        embers += (0.001 + mid * 0.002) / (d + 0.01) * flicker;
    }
    col += vec3(1.0, 0.4, 0.1) * embers * 0.2;

    // Ambient glow at the base
    col += vec3(0.3, 0.05, 0.0) * smoothstep(0.5, -0.8, p.y) * 0.3 * (0.5 + bass);

    // High sparkles
    float highSpark = noise(p * 20.0 + t * 5.0) * u_high * u_intensity;
    col += vec3(1.0, 0.8, 0.3) * highSpark * envelope * 0.3;

    fragColor = vec4(col, 1.0);
}`},{name:"Crystal Cave",description:"Geometric kaleidoscope reflections — high frequencies drive sparkle",source:`#version 300 es
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_intensity;
uniform vec2 u_resolution;

out vec4 fragColor;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= u_resolution.x / u_resolution.y;

    float t = u_time;
    float high = u_high * u_intensity;
    float bass = u_bass * u_intensity;
    float mid = u_mid * u_intensity;
    float beat = u_beat * u_intensity;

    // Polar coordinates
    float r = length(p);
    float a = atan(p.y, p.x);

    // Kaleidoscope — fold angle into segments
    float segments = 6.0 + beat * 2.0;
    float segAngle = 3.14159 * 2.0 / segments;
    a = mod(a, segAngle);
    a = abs(a - segAngle * 0.5);

    // Back to cartesian for crystal geometry
    vec2 cp = vec2(cos(a), sin(a)) * r;

    // Crystal facets — repeating triangular grid
    float scale = 3.0 + bass * 2.0;
    vec2 grid = cp * scale;
    vec2 gi = floor(grid);
    vec2 gf = fract(grid) - 0.5;

    // Facet distance
    float facet = min(min(
        abs(gf.x),
        abs(gf.y)),
        abs(gf.x + gf.y - 0.5) * 0.707
    );

    // Crystal edge glow
    float edge = smoothstep(0.05 + high * 0.03, 0.0, facet);

    // Prismatic color based on angle and position
    float hue = fract(a / 3.14159 + gi.x * 0.1 + gi.y * 0.13 + t * 0.1);
    float sat = 0.6 + high * 0.3;
    float val = 0.3 + edge * 0.7;

    vec3 col = hsv2rgb(vec3(hue, sat, val));

    // Inner glow — bright center
    float centerGlow = exp(-r * 2.0) * (0.5 + beat * 0.5);
    col += vec3(0.5, 0.3, 0.8) * centerGlow;

    // Sparkle on crystal facets driven by high frequencies
    float sparklePhase = sin(gi.x * 127.1 + gi.y * 311.7);
    float sparkle = pow(max(0.0, sin(sparklePhase * 20.0 + t * 8.0)), 20.0);
    col += vec3(1.0) * sparkle * high * 1.5;

    // Facet internal refraction colors
    vec3 refractCol = hsv2rgb(vec3(
        fract(hue + 0.3 + mid * 0.2),
        0.8,
        0.5 * (1.0 - edge)
    ));
    col = mix(col, refractCol, 0.3 * (1.0 - edge));

    // Pulsing brightness on beat
    col *= 1.0 + beat * 0.4;

    // Depth fade
    col *= smoothstep(2.0, 0.5, r);

    // Subtle rotation shimmer
    float shimmer = sin(a * segments * 2.0 + t * 3.0) * 0.5 + 0.5;
    col += vec3(0.2, 0.1, 0.3) * shimmer * high * 0.3;

    fragColor = vec4(col, 1.0);
}`},{name:"Void",description:"Minimal dark shader — intensity reveals hidden layers",source:`#version 300 es
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_intensity;
uniform vec2 u_resolution;

out vec4 fragColor;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= u_resolution.x / u_resolution.y;

    float t = u_time;
    float intensity = u_intensity;

    // Base: near-black with very subtle gradient
    vec3 col = vec3(0.01, 0.01, 0.015) + uv.y * 0.01;

    // Layer 1 (intensity > 0.1): subtle dark breathing circle
    float r = length(p);
    float breath = sin(t * 0.5) * 0.02 * intensity;
    float ring = smoothstep(0.5 + breath, 0.48 + breath, r) * smoothstep(0.4, 0.45, r);
    col += vec3(0.03, 0.02, 0.05) * ring * smoothstep(0.0, 0.2, intensity);

    // Layer 2 (intensity > 0.3): dark ripples from center
    float ripple = sin(r * 20.0 - t * 2.0) * 0.5 + 0.5;
    ripple *= exp(-r * 3.0);
    col += vec3(0.05, 0.02, 0.08) * ripple * smoothstep(0.2, 0.4, intensity) * (0.5 + u_bass * 0.5);

    // Layer 3 (intensity > 0.5): particle dust orbiting
    float dust = 0.0;
    for (float i = 0.0; i < 12.0; i++) {
        float angle = i / 12.0 * 6.283 + t * (0.2 + hash(vec2(i)) * 0.3);
        float radius = 0.3 + sin(t * 0.3 + i) * 0.15;
        vec2 dp = vec2(cos(angle), sin(angle)) * radius;
        float d = length(p - dp);
        float glow = 0.002 / (d + 0.01);
        dust += glow * (0.5 + u_mid * 0.5);
    }
    col += vec3(0.1, 0.05, 0.15) * dust * smoothstep(0.4, 0.6, intensity);

    // Layer 4 (intensity > 0.7): fractal tendrils
    float tendril = 0.0;
    vec2 tp = p * 2.0;
    for (int i = 0; i < 5; i++) {
        tp = abs(tp) / dot(tp, tp) - 0.8;
        tp *= mat2(cos(t * 0.1), sin(t * 0.1), -sin(t * 0.1), cos(t * 0.1));
        tendril += exp(-length(tp) * 2.0);
    }
    tendril /= 5.0;
    vec3 tendrilCol = vec3(0.15, 0.05, 0.25) * tendril;
    col += tendrilCol * smoothstep(0.6, 0.8, intensity) * (0.7 + u_high * 0.3);

    // Layer 5 (intensity > 0.9): full reveal — bright energy core
    float core = exp(-r * 4.0);
    vec3 coreCol = mix(vec3(0.2, 0.0, 0.4), vec3(0.5, 0.1, 0.8), core);
    col += coreCol * core * smoothstep(0.8, 1.0, intensity) * (0.8 + u_beat * 0.5);

    // Beat — subtle dark flash
    col += vec3(0.02, 0.01, 0.03) * u_beat * intensity;

    // Keep it dark overall
    col = min(col, vec3(0.8));

    fragColor = vec4(col, 1.0);
}`}],w=`#version 300 es
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_intensity;
uniform vec2 u_resolution;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= u_resolution.x / u_resolution.y;

    float t = u_time * 0.3;

    // Gentle animated gradient
    float angle = atan(p.y, p.x);
    float r = length(p);

    // Slow swirling gradient
    float swirl = sin(angle * 2.0 + t + r * 3.0) * 0.5 + 0.5;
    float wave = sin(r * 4.0 - t * 2.0) * 0.5 + 0.5;

    // Base colors — dark blue to purple
    vec3 c1 = vec3(0.05, 0.05, 0.15);
    vec3 c2 = vec3(0.12, 0.05, 0.2);
    vec3 c3 = vec3(0.08, 0.1, 0.25);

    vec3 col = mix(c1, c2, swirl);
    col = mix(col, c3, wave * 0.5);

    // Subtle audio reactivity
    col += vec3(0.03, 0.01, 0.05) * u_bass * u_intensity;
    col += vec3(0.02, 0.04, 0.03) * u_mid * u_intensity;
    col += vec3(0.04, 0.03, 0.02) * u_high * u_intensity * (sin(t * 8.0) * 0.5 + 0.5);

    // Soft center glow
    float glow = exp(-r * 1.5) * 0.15;
    col += vec3(0.1, 0.05, 0.15) * glow * (1.0 + u_beat * u_intensity * 0.5);

    // Vignette
    col *= 1.0 - r * 0.3;

    fragColor = vec4(col, 1.0);
}
`;class V{constructor(){n(this,"audio");n(this,"renderer");n(this,"ui");n(this,"intensity",.5);n(this,"startTime",0);n(this,"running",!1);n(this,"loop",()=>{if(!this.running)return;const t=this.audio.getUniforms(),s={u_time:performance.now()/1e3-this.startTime,u_bass:t.u_bass,u_mid:t.u_mid,u_high:t.u_high,u_beat:t.u_beat,u_intensity:this.intensity,u_resolution:[window.innerWidth,window.innerHeight]};this.renderer.render(s),requestAnimationFrame(this.loop)});this.audio=new C,this.renderer=new E,this.ui=new T}async init(){const t=document.getElementById("canvas");if(!t)throw new Error("Canvas element not found");this.renderer.init(t,w),this.renderer.onError=s=>this.ui.showToast(s,4e3),this.ui.init(),this.wireUI();const e=localStorage.getItem("shader-visuals-intensity");e!==null&&(this.intensity=parseFloat(e)),g.length>0&&this.renderer.crossfadeTo(g[0].source,300),this.startTime=performance.now()/1e3,this.running=!0,this.loop(),this.registerSW()}wireUI(){this.ui.onGenerate=async(t,e)=>{const s=localStorage.getItem("shader-visuals-api-key")||"";if(!s){this.ui.showToast("Set your API key in settings first",3e3);return}if(!t.trim()&&!e.trim()){this.ui.showToast("Enter a scene or vibe first",2e3);return}this.ui.setLoading(!0);try{const i=await _(t,e,s,void 0);if(!this.renderer.crossfadeTo(i)){this.ui.showToast("Shader had errors, retrying...",2e3);try{const l=await _(t,e,s,"Previous shader failed to compile. Please output simpler, valid GLSL.");this.renderer.crossfadeTo(l)||(this.ui.showToast("Shader failed to compile. Using fallback.",3e3),this.renderer.crossfadeTo(w))}catch(l){this.ui.showToast(`Retry failed: ${l.message}`,3e3)}}}catch(i){this.ui.showToast(`Generation failed: ${i.message}`,4e3)}finally{this.ui.setLoading(!1)}},this.ui.onPresetSelect=t=>{const e=g.find(s=>s.name===t);e&&this.renderer.crossfadeTo(e.source)},this.ui.onIntensityChange=t=>{this.intensity=t,localStorage.setItem("shader-visuals-intensity",String(t))},this.ui.onMicToggle=async()=>{if(this.audio.isActive)this.audio.stop();else try{await this.audio.init(),this.audio.start()}catch{this.ui.showToast("Microphone access denied",3e3)}},this.ui.onApiKeyChange=t=>{localStorage.setItem("shader-visuals-api-key",t)}}async registerSW(){if("serviceWorker"in navigator)try{await navigator.serviceWorker.register("/sw.js")}catch{}}}const D=new V;D.init().catch(r=>{console.error("Failed to initialize app:",r),document.body.innerHTML=`
    <div style="color:#fff;font-family:system-ui;padding:2rem;text-align:center;">
      <h1>Failed to start</h1>
      <p>${r.message||"Unknown error"}</p>
    </div>
  `});
