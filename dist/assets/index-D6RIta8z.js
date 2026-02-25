var T=Object.defineProperty;var R=(r,t,e)=>t in r?T(r,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):r[t]=e;var n=(r,t,e)=>R(r,typeof t!="symbol"?t+"":t,e);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))i(s);new MutationObserver(s=>{for(const o of s)if(o.type==="childList")for(const a of o.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&i(a)}).observe(document,{childList:!0,subtree:!0});function e(s){const o={};return s.integrity&&(o.integrity=s.integrity),s.referrerPolicy&&(o.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?o.credentials="include":s.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function i(s){if(s.ep)return;s.ep=!0;const o=e(s);fetch(s.href,o)}})();class F{constructor(){n(this,"ctx",null);n(this,"analyser",null);n(this,"source",null);n(this,"stream",null);n(this,"audioElement",null);n(this,"freqData",new Uint8Array(0));n(this,"active",!1);n(this,"failed",!1);n(this,"mode","none");n(this,"rollingAvg",0);n(this,"beat",0);n(this,"smoothBass",0);n(this,"smoothMid",0);n(this,"smoothHigh",0);n(this,"smooth",.8)}ensureContext(){if(!this.ctx){const t=window.AudioContext||window.webkitAudioContext;this.ctx=new t({sampleRate:44100})}return this.ctx}ensureAnalyser(){const t=this.ensureContext();return this.analyser||(this.analyser=t.createAnalyser(),this.analyser.fftSize=2048,this.analyser.smoothingTimeConstant=.4,this.freqData=new Uint8Array(this.analyser.frequencyBinCount)),this.analyser}async initMic(){this.cleanup();try{const t=this.ensureContext(),e=this.ensureAnalyser();this.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:!1,noiseSuppression:!1,autoGainControl:!1}}),this.source=t.createMediaStreamSource(this.stream),this.source.connect(e),this.mode="mic",this.active=!0,t.state==="suspended"&&t.resume()}catch(t){throw console.warn("AudioEngine: mic access denied or unavailable",t),this.failed=!0,t}}initFile(t){this.cleanup();const e=this.ensureContext(),i=this.ensureAnalyser();this.audioElement=new Audio,this.audioElement.crossOrigin="anonymous",this.audioElement.src=URL.createObjectURL(t),this.audioElement.loop=!0;const s=e.createMediaElementSource(this.audioElement);s.connect(i),i.connect(e.destination),this.source=s,this.mode="file",this.active=!0,e.state==="suspended"&&e.resume(),this.audioElement.play()}cleanup(){if(this.stream&&(this.stream.getTracks().forEach(t=>t.stop()),this.stream=null),this.audioElement&&(this.audioElement.pause(),URL.revokeObjectURL(this.audioElement.src),this.audioElement=null),this.source&&(this.source.disconnect(),this.source=null),this.analyser)try{this.analyser.disconnect()}catch{}this.smoothBass=0,this.smoothMid=0,this.smoothHigh=0,this.rollingAvg=0,this.beat=0,this.mode="none",this.active=!1,this.failed=!1}stop(){this.cleanup(),this.ctx&&(this.ctx.close(),this.ctx=null,this.analyser=null,this.freqData=new Uint8Array(0))}get isActive(){return this.active}get currentMode(){return this.mode}get audioEl(){return this.audioElement}togglePlayPause(){this.mode!=="file"||!this.audioElement||(this.audioElement.paused?this.audioElement.play():this.audioElement.pause())}getUniforms(){if(!this.active||!this.analyser||!this.ctx)return{u_bass:0,u_mid:0,u_high:0,u_beat:0};this.analyser.getByteFrequencyData(this.freqData);const t=this.ctx.sampleRate,e=this.analyser.frequencyBinCount,i=t/(e*2),s=Math.floor(20/i),o=Math.min(Math.floor(250/i),e-1),a=o+1,h=Math.min(Math.floor(2e3/i),e-1),p=h+1,u=Math.min(Math.floor(16e3/i),e-1),d=C(this.freqData,s,o),f=C(this.freqData,a,h),v=C(this.freqData,p,u);return this.smoothBass=this.smoothBass*this.smooth+d*(1-this.smooth),this.smoothMid=this.smoothMid*this.smooth+f*(1-this.smooth),this.smoothHigh=this.smoothHigh*this.smooth+v*(1-this.smooth),this.rollingAvg=this.rollingAvg*.95+this.smoothBass*.05,this.smoothBass>this.rollingAvg*1.5&&(this.beat=1),this.beat*=.9,{u_bass:_(this.smoothBass),u_mid:_(this.smoothMid),u_high:_(this.smoothHigh),u_beat:_(this.beat)}}}function C(r,t,e){if(t>e||t>=r.length)return 0;let i=0;const s=Math.min(e,r.length-1);for(let o=t;o<=s;o++)i+=r[o];return i/((s-t+1)*255)}function _(r){return r<0?0:r>1?1:r}const A=`#version 300 es
in vec4 a_position;
void main() {
    gl_Position = a_position;
}
`,D=new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),z=["u_time","u_bass","u_mid","u_high","u_beat","u_intensity","u_resolution"];class H{constructor(){n(this,"gl",null);n(this,"vao",null);n(this,"compiledVertex",null);n(this,"current",null);n(this,"next",null);n(this,"crossfadeStart",0);n(this,"crossfadeDuration",0);n(this,"crossfading",!1);n(this,"onError",null)}init(t,e){const i=t.getContext("webgl2",{alpha:!1,antialias:!1});if(!i){this.onError?.("WebGL2 not supported");return}this.gl=i,t.addEventListener("webglcontextlost",s=>{s.preventDefault(),this.current=null,this.next=null,this.compiledVertex=null,this.vao=null}),t.addEventListener("webglcontextrestored",()=>{this.gl&&(this.setupGeometry(),this.compiledVertex=this.compileShader(i.VERTEX_SHADER,A))}),this.setupGeometry(),this.compiledVertex=this.compileShader(i.VERTEX_SHADER,A),this.compiledVertex&&(this.current=this.buildProgram(e),this.current||this.onError?.("Default shader failed to compile"),this.resize(),window.addEventListener("resize",()=>this.resize()))}loadShader(t){const e=this.buildProgram(t);return e?(this.disposeProgram(this.current),this.current=e,this.crossfading=!1,this.next=null,!0):!1}crossfadeTo(t,e=500){const i=this.buildProgram(t);return i?(this.crossfading&&this.next&&(this.disposeProgram(this.current),this.current=this.next),this.next=i,this.crossfadeDuration=e,this.crossfadeStart=performance.now(),this.crossfading=!0,!0):!1}render(t){const e=this.gl;if(!(!e||!this.current)){if(e.viewport(0,0,e.drawingBufferWidth,e.drawingBufferHeight),e.bindVertexArray(this.vao),this.crossfading&&this.next){const i=Math.min((performance.now()-this.crossfadeStart)/this.crossfadeDuration,1);e.enable(e.BLEND),e.blendFunc(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA),e.clearColor(0,0,0,1),e.clear(e.COLOR_BUFFER_BIT),this.drawWithProgram(this.current,t,1),this.drawWithProgram(this.next,t,i),e.disable(e.BLEND),i>=1&&(this.disposeProgram(this.current),this.current=this.next,this.next=null,this.crossfading=!1)}else e.disable(e.BLEND),e.clearColor(0,0,0,1),e.clear(e.COLOR_BUFFER_BIT),this.drawWithProgram(this.current,t,1);e.bindVertexArray(null)}}resize(){const t=this.gl;if(!t)return;const e=t.canvas,i=window.devicePixelRatio||1,s=e.clientWidth*i,o=e.clientHeight*i;(e.width!==s||e.height!==o)&&(e.width=s,e.height=o)}setupGeometry(){const t=this.gl;this.vao=t.createVertexArray(),t.bindVertexArray(this.vao);const e=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,e),t.bufferData(t.ARRAY_BUFFER,D,t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null)}compileShader(t,e){const i=this.gl,s=i.createShader(t);if(!s)return this.onError?.("Failed to create shader object"),null;if(i.shaderSource(s,e),i.compileShader(s),!i.getShaderParameter(s,i.COMPILE_STATUS)){const o=i.getShaderInfoLog(s)||"Unknown compile error";return i.deleteShader(s),this.onError?.(o),null}return s}buildProgram(t){const e=this.gl;if(!e||!this.compiledVertex)return null;const i=this.compileShader(e.FRAGMENT_SHADER,t);if(!i)return null;const s=e.createProgram();if(!s)return e.deleteShader(i),this.onError?.("Failed to create program"),null;if(e.attachShader(s,this.compiledVertex),e.attachShader(s,i),e.bindAttribLocation(s,0,"a_position"),e.linkProgram(s),e.deleteShader(i),!e.getProgramParameter(s,e.LINK_STATUS)){const a=e.getProgramInfoLog(s)||"Unknown link error";return e.deleteProgram(s),this.onError?.(a),null}const o={};for(const a of z)o[a]=e.getUniformLocation(s,a);return o.u_alpha=e.getUniformLocation(s,"u_alpha"),{program:s,uniforms:o}}drawWithProgram(t,e,i){const s=this.gl;s.useProgram(t.program),t.uniforms.u_time!=null&&s.uniform1f(t.uniforms.u_time,e.u_time),t.uniforms.u_bass!=null&&s.uniform1f(t.uniforms.u_bass,e.u_bass),t.uniforms.u_mid!=null&&s.uniform1f(t.uniforms.u_mid,e.u_mid),t.uniforms.u_high!=null&&s.uniform1f(t.uniforms.u_high,e.u_high),t.uniforms.u_beat!=null&&s.uniform1f(t.uniforms.u_beat,e.u_beat),t.uniforms.u_intensity!=null&&s.uniform1f(t.uniforms.u_intensity,e.u_intensity),t.uniforms.u_resolution!=null&&s.uniform2f(t.uniforms.u_resolution,e.u_resolution[0],e.u_resolution[1]),i<1?(s.blendFunc(s.CONSTANT_ALPHA,s.ONE_MINUS_CONSTANT_ALPHA),s.blendColor(0,0,0,i)):s.blendFunc(s.SRC_ALPHA,s.ONE_MINUS_SRC_ALPHA),s.drawArrays(s.TRIANGLES,0,6)}disposeProgram(t){!t||!this.gl||this.gl.deleteProgram(t.program)}}const O=`#version 300 es
precision highp float;

in vec3 a_position;
in vec3 a_color;

uniform mat4 u_projection;
uniform mat4 u_view;
uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_coherence;  // 1.0 = solid, 0.0 = chaos
uniform float u_pointScale;
uniform float u_transition; // 0-1 crossfade between old and new cloud

out vec3 v_color;
out float v_alpha;

// Simple hash for per-point randomness
float hash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

void main() {
  float idx = float(gl_VertexID);

  // Original position
  vec3 pos = a_position;

  // ── Coherence displacement ──
  // Low coherence → scatter points using noise
  float chaos = 1.0 - u_coherence;

  // Per-point random seed
  float h1 = hash(idx);
  float h2 = hash(idx + 1000.0);
  float h3 = hash(idx + 2000.0);

  // Noise-based displacement (mild at chaos=0.5, wild at chaos=1.0)
  float t = u_time * 0.5;
  vec3 scatter = vec3(
    sin(idx * 0.017 + t * (0.5 + h1)) * h1,
    cos(idx * 0.013 + t * (0.4 + h2)) * h2,
    sin(idx * 0.011 + t * (0.6 + h3)) * h3
  ) * chaos * 2.0;

  pos += scatter;

  // ── Audio modulation ──
  // Bass pushes points outward from center
  vec3 dir = normalize(pos + vec3(0.001));
  pos += dir * u_bass * 0.15 * (1.0 + chaos * 0.5);

  // Beat snap — momentarily pull toward origin then push
  pos *= 1.0 + u_beat * 0.2 * chaos;

  // Mid frequency: gentle wave displacement
  pos.y += sin(pos.x * 4.0 + u_time * 2.0) * u_mid * 0.05;

  gl_Position = u_projection * u_view * vec4(pos, 1.0);

  // Point size: base + audio-reactive
  float basePtSize = u_pointScale;
  float audioPtSize = u_bass * 2.0 + u_beat * 3.0;
  gl_PointSize = max(1.0, basePtSize + audioPtSize);

  v_color = a_color;

  // High frequencies add brightness shimmer
  v_color += vec3(u_high * 0.15 * h1, u_high * 0.1 * h2, u_high * 0.2 * h3);

  // Beat flash
  v_color += vec3(0.15, 0.08, 0.2) * u_beat;

  v_alpha = u_transition;
}
`,U=`#version 300 es
precision highp float;

in vec3 v_color;
in float v_alpha;

out vec4 fragColor;

void main() {
  // Round points — discard corners for circular shape
  vec2 coord = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(coord, coord);
  if (r2 > 1.0) discard;

  // Soft edge glow
  float edge = 1.0 - smoothstep(0.5, 1.0, r2);

  fragColor = vec4(v_color * edge, v_alpha * edge);
}
`;class V{constructor(){n(this,"gl",null);n(this,"program",null);n(this,"vao",null);n(this,"posBuf",null);n(this,"colBuf",null);n(this,"pointCount",0);n(this,"prevVao",null);n(this,"prevPosBuf",null);n(this,"prevColBuf",null);n(this,"prevCount",0);n(this,"crossfading",!1);n(this,"crossfadeStart",0);n(this,"crossfadeDuration",1500);n(this,"uniforms",{});n(this,"onError",null)}init(t){const e=t.getContext("webgl2",{alpha:!1,antialias:!1});if(!e){this.onError?.("WebGL2 not supported");return}this.gl=e;const i=this.compile(e.VERTEX_SHADER,O),s=this.compile(e.FRAGMENT_SHADER,U);if(!i||!s)return;const o=e.createProgram();if(e.attachShader(o,i),e.attachShader(o,s),e.linkProgram(o),e.deleteShader(i),e.deleteShader(s),!e.getProgramParameter(o,e.LINK_STATUS)){this.onError?.("Point shader link failed: "+e.getProgramInfoLog(o)),e.deleteProgram(o);return}this.program=o;const a=["u_projection","u_view","u_time","u_bass","u_mid","u_high","u_beat","u_coherence","u_pointScale","u_transition"];for(const h of a)this.uniforms[h]=e.getUniformLocation(o,h);e.enable(e.BLEND),e.blendFunc(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA),e.enable(e.DEPTH_TEST),e.depthFunc(e.LEQUAL),t.addEventListener("webglcontextlost",h=>{h.preventDefault(),this.program=null,this.vao=null,this.prevVao=null}),this.resize(),window.addEventListener("resize",()=>this.resize())}setPointCloud(t){const e=this.gl;if(!e||!this.program)return;this.vao&&this.pointCount>0&&(this.disposePrev(),this.prevVao=this.vao,this.prevPosBuf=this.posBuf,this.prevColBuf=this.colBuf,this.prevCount=this.pointCount,this.crossfading=!0,this.crossfadeStart=performance.now()),this.vao=e.createVertexArray(),e.bindVertexArray(this.vao),this.posBuf=e.createBuffer(),e.bindBuffer(e.ARRAY_BUFFER,this.posBuf),e.bufferData(e.ARRAY_BUFFER,t.positions,e.STATIC_DRAW);const i=e.getAttribLocation(this.program,"a_position");e.enableVertexAttribArray(i),e.vertexAttribPointer(i,3,e.FLOAT,!1,0,0),this.colBuf=e.createBuffer(),e.bindBuffer(e.ARRAY_BUFFER,this.colBuf),e.bufferData(e.ARRAY_BUFFER,t.colors,e.STATIC_DRAW);const s=e.getAttribLocation(this.program,"a_color");e.enableVertexAttribArray(s),e.vertexAttribPointer(s,3,e.FLOAT,!1,0,0),e.bindVertexArray(null),this.pointCount=t.count}get hasCloud(){return this.pointCount>0}render(t){const e=this.gl;if(!e||!this.program)return;e.viewport(0,0,e.drawingBufferWidth,e.drawingBufferHeight),e.clearColor(0,0,0,1),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT),e.useProgram(this.program);const i=this.uniforms;i.u_projection&&e.uniformMatrix4fv(i.u_projection,!1,t.projection),i.u_view&&e.uniformMatrix4fv(i.u_view,!1,t.view),i.u_time&&e.uniform1f(i.u_time,t.time),i.u_bass&&e.uniform1f(i.u_bass,t.bass),i.u_mid&&e.uniform1f(i.u_mid,t.mid),i.u_high&&e.uniform1f(i.u_high,t.high),i.u_beat&&e.uniform1f(i.u_beat,t.beat),i.u_coherence&&e.uniform1f(i.u_coherence,t.coherence),i.u_pointScale&&e.uniform1f(i.u_pointScale,t.pointScale);let s=1;this.crossfading&&(s=Math.min((performance.now()-this.crossfadeStart)/this.crossfadeDuration,1)),this.crossfading&&this.prevVao&&this.prevCount>0&&(i.u_transition&&e.uniform1f(i.u_transition,1-s),e.bindVertexArray(this.prevVao),e.drawArrays(e.POINTS,0,this.prevCount)),this.vao&&this.pointCount>0&&(i.u_transition&&e.uniform1f(i.u_transition,this.crossfading?s:1),e.bindVertexArray(this.vao),e.drawArrays(e.POINTS,0,this.pointCount)),e.bindVertexArray(null),this.crossfading&&s>=1&&(this.disposePrev(),this.crossfading=!1)}resize(){const t=this.gl;if(!t)return;const e=t.canvas,i=window.devicePixelRatio||1,s=e.clientWidth*i,o=e.clientHeight*i;(e.width!==s||e.height!==o)&&(e.width=s,e.height=o)}compile(t,e){const i=this.gl,s=i.createShader(t);return s?(i.shaderSource(s,e),i.compileShader(s),i.getShaderParameter(s,i.COMPILE_STATUS)?s:(this.onError?.("Shader compile: "+i.getShaderInfoLog(s)),i.deleteShader(s),null)):null}disposePrev(){const t=this.gl;t&&(this.prevVao&&(t.deleteVertexArray(this.prevVao),this.prevVao=null),this.prevPosBuf&&(t.deleteBuffer(this.prevPosBuf),this.prevPosBuf=null),this.prevColBuf&&(t.deleteBuffer(this.prevColBuf),this.prevColBuf=null),this.prevCount=0)}}class N{constructor(){n(this,"theta",0);n(this,"phi",Math.PI/2);n(this,"distance",2.5);n(this,"dragging",!1);n(this,"lastX",0);n(this,"lastY",0);n(this,"pinchDist",0);n(this,"canvas",null);n(this,"_onMouseDown",t=>this.onMouseDown(t));n(this,"_onMouseMove",t=>this.onMouseMove(t));n(this,"_onMouseUp",()=>this.onMouseUp());n(this,"_onWheel",t=>this.onWheel(t));n(this,"_onTouchStart",t=>this.onTouchStart(t));n(this,"_onTouchMove",t=>this.onTouchMove(t));n(this,"_onTouchEnd",()=>this.onTouchEnd())}attach(t){this.canvas=t,t.addEventListener("mousedown",this._onMouseDown),window.addEventListener("mousemove",this._onMouseMove),window.addEventListener("mouseup",this._onMouseUp),t.addEventListener("wheel",this._onWheel,{passive:!1}),t.addEventListener("touchstart",this._onTouchStart,{passive:!1}),t.addEventListener("touchmove",this._onTouchMove,{passive:!1}),t.addEventListener("touchend",this._onTouchEnd)}getViewMatrix(){const t=Math.max(.1,Math.min(Math.PI-.1,this.phi)),e=this.distance*Math.sin(t)*Math.sin(this.theta),i=this.distance*Math.cos(t),s=this.distance*Math.sin(t)*Math.cos(this.theta);return G(e,i,s,0,0,0,0,1,0)}getProjectionMatrix(t){return Y(Math.PI/4,t,.01,100)}onMouseDown(t){t.button===0&&(this.dragging=!0,this.lastX=t.clientX,this.lastY=t.clientY)}onMouseMove(t){if(!this.dragging)return;const e=t.clientX-this.lastX,i=t.clientY-this.lastY;this.lastX=t.clientX,this.lastY=t.clientY,this.theta+=e*.005,this.phi+=i*.005,this.phi=Math.max(.1,Math.min(Math.PI-.1,this.phi))}onMouseUp(){this.dragging=!1}onWheel(t){t.preventDefault(),this.distance+=t.deltaY*.003,this.distance=Math.max(.5,Math.min(10,this.distance))}onTouchStart(t){t.target.closest(".sv-panel, .sv-settings")||(t.preventDefault(),t.touches.length===1?(this.dragging=!0,this.lastX=t.touches[0].clientX,this.lastY=t.touches[0].clientY):t.touches.length===2&&(this.dragging=!1,this.pinchDist=E(t.touches[0],t.touches[1])))}onTouchMove(t){if(!t.target.closest(".sv-panel, .sv-settings")){if(t.preventDefault(),t.touches.length===1&&this.dragging){const e=t.touches[0].clientX-this.lastX,i=t.touches[0].clientY-this.lastY;this.lastX=t.touches[0].clientX,this.lastY=t.touches[0].clientY,this.theta+=e*.005,this.phi+=i*.005,this.phi=Math.max(.1,Math.min(Math.PI-.1,this.phi))}else if(t.touches.length===2){const e=E(t.touches[0],t.touches[1]),i=this.pinchDist-e;this.distance+=i*.005,this.distance=Math.max(.5,Math.min(10,this.distance)),this.pinchDist=e}}}onTouchEnd(){this.dragging=!1}}function E(r,t){const e=r.clientX-t.clientX,i=r.clientY-t.clientY;return Math.sqrt(e*e+i*i)}function G(r,t,e,i,s,o,a,h,p){let u=r-i,d=t-s,f=e-o,v=Math.sqrt(u*u+d*d+f*f);v>0&&(u/=v,d/=v,f/=v);let g=h*f-p*d,m=p*u-a*f,c=a*d-h*u;v=Math.sqrt(g*g+m*m+c*c),v>0&&(g/=v,m/=v,c/=v);const b=d*c-f*m,y=f*g-u*c,x=u*m-d*g;return new Float32Array([g,b,u,0,m,y,d,0,c,x,f,0,-(g*r+m*t+c*e),-(b*r+y*t+x*e),-(u*r+d*t+f*e),1])}function Y(r,t,e,i){const s=1/Math.tan(r/2),o=1/(e-i);return new Float32Array([s/t,0,0,0,0,s,0,0,0,0,(e+i)*o,-1,0,0,2*e*i*o,0])}const M="shader-visuals-api-key",j=5e3,q=["Cosmic Ocean","Neon Grid","Forest Fire","Crystal Cave","Void"];class W{constructor(){n(this,"onGenerate",null);n(this,"onPresetSelect",null);n(this,"onIntensityChange",null);n(this,"onCoherenceChange",null);n(this,"onMicToggle",null);n(this,"onMusicFile",null);n(this,"onApiKeyChange",null);n(this,"overlay");n(this,"toastEl");n(this,"panel");n(this,"settingsPanel");n(this,"generateBtn");n(this,"sceneInput");n(this,"vibeInput");n(this,"micBtn");n(this,"musicBtn");n(this,"fileInput");n(this,"settingsBtn");n(this,"apiKeyInput");n(this,"intensitySlider");n(this,"intensityLabel");n(this,"coherenceSlider");n(this,"coherenceLabel");n(this,"hideTimer",0);n(this,"visible",!1);n(this,"settingsOpen",!1)}init(){this.injectStyles(),this.overlay=document.getElementById("overlay"),this.toastEl=document.getElementById("toast"),this.panel=l("div","sv-panel"),this.sceneInput=l("input","sv-input"),this.sceneInput.type="text",this.sceneInput.placeholder="describe a scene...",this.sceneInput.autocomplete="off",this.vibeInput=l("input","sv-input"),this.vibeInput.type="text",this.vibeInput.placeholder="set the vibe...",this.vibeInput.autocomplete="off",this.generateBtn=l("button","sv-btn sv-btn-primary"),this.generateBtn.textContent="Generate",this.generateBtn.addEventListener("click",()=>{this.onGenerate?.(this.sceneInput.value.trim(),this.vibeInput.value.trim())});const t=l("div","sv-preset-row");for(const c of q){const b=l("button","sv-btn sv-btn-preset");b.textContent=c,b.addEventListener("click",()=>{this.onPresetSelect?.(c),this.resetAutoHide()}),t.appendChild(b)}const e=l("div","sv-slider-group"),i=l("div","sv-slider-header"),s=l("span","sv-slider-title");s.textContent="Intensity",this.intensityLabel=l("span","sv-slider-value"),this.intensityLabel.textContent="50%",i.appendChild(s),i.appendChild(this.intensityLabel),this.intensitySlider=l("input","sv-slider"),this.intensitySlider.type="range",this.intensitySlider.min="0",this.intensitySlider.max="100",this.intensitySlider.value="50",this.intensitySlider.addEventListener("input",()=>{const c=parseInt(this.intensitySlider.value,10);this.intensityLabel.textContent=`${c}%`,this.onIntensityChange?.(c/100),this.resetAutoHide()}),e.appendChild(i),e.appendChild(this.intensitySlider);const o=l("div","sv-slider-group"),a=l("div","sv-slider-header"),h=l("span","sv-slider-title");h.textContent="Coherence",this.coherenceLabel=l("span","sv-slider-value"),this.coherenceLabel.textContent="80%",a.appendChild(h),a.appendChild(this.coherenceLabel),this.coherenceSlider=l("input","sv-slider"),this.coherenceSlider.type="range",this.coherenceSlider.min="0",this.coherenceSlider.max="100",this.coherenceSlider.value="80",this.coherenceSlider.addEventListener("input",()=>{const c=parseInt(this.coherenceSlider.value,10);this.coherenceLabel.textContent=`${c}%`,this.onCoherenceChange?.(c/100),this.resetAutoHide()}),o.appendChild(a),o.appendChild(this.coherenceSlider);const p=l("div","sv-toolbar");this.micBtn=l("button","sv-btn sv-btn-icon"),this.micBtn.innerHTML=P,this.micBtn.title="Toggle microphone",this.micBtn.addEventListener("click",()=>{this.onMicToggle?.(),this.resetAutoHide()}),this.musicBtn=l("button","sv-btn sv-btn-icon"),this.musicBtn.innerHTML=X,this.musicBtn.title="Play music file",this.fileInput=l("input",""),this.fileInput.type="file",this.fileInput.accept="audio/*",this.fileInput.style.display="none",this.fileInput.addEventListener("change",()=>{const c=this.fileInput.files?.[0];c&&this.onMusicFile?.(c),this.fileInput.value="",this.resetAutoHide()}),this.musicBtn.addEventListener("click",()=>{this.fileInput.click(),this.resetAutoHide()}),this.settingsBtn=l("button","sv-btn sv-btn-icon"),this.settingsBtn.innerHTML=$,this.settingsBtn.title="Settings",this.settingsBtn.addEventListener("click",()=>{this.toggleSettings(),this.resetAutoHide()}),p.appendChild(this.micBtn),p.appendChild(this.musicBtn),p.appendChild(this.fileInput),p.appendChild(this.settingsBtn),this.settingsPanel=l("div","sv-settings");const u=l("div","sv-settings-title");u.textContent="Settings";const d=l("button","sv-btn sv-btn-close");d.textContent="✕",d.addEventListener("click",()=>{this.settingsOpen=!1,this.settingsPanel.classList.add("sv-hidden")}),u.appendChild(d);const f=l("div","sv-apikey-group"),v=l("label","sv-label");v.textContent="OpenAI API Key",this.apiKeyInput=l("input","sv-input sv-input-key"),this.apiKeyInput.type="password",this.apiKeyInput.placeholder="sk-...",this.apiKeyInput.autocomplete="off";const g=localStorage.getItem(M)??"";this.apiKeyInput.value=g,this.apiKeyInput.addEventListener("input",()=>{const c=this.apiKeyInput.value.trim();localStorage.setItem(M,c),this.onApiKeyChange?.(c),this.resetAutoHide()}),f.appendChild(v),f.appendChild(this.apiKeyInput),this.settingsPanel.appendChild(u),this.settingsPanel.appendChild(f),this.panel.appendChild(this.sceneInput),this.panel.appendChild(this.vibeInput),this.panel.appendChild(this.generateBtn),this.panel.appendChild(t),this.panel.appendChild(e),this.panel.appendChild(o),this.panel.appendChild(p),this.overlay.appendChild(this.panel),this.overlay.appendChild(this.settingsPanel),this.overlay.addEventListener("click",c=>{if(c.target.closest(".sv-panel, .sv-settings")){this.resetAutoHide();return}this.toggleOverlay()}),this.panel.style.pointerEvents="auto",this.settingsPanel.style.pointerEvents="auto";const m=l("div","sv-tap-zone");m.style.pointerEvents="auto",this.overlay.insertBefore(m,this.overlay.firstChild),this.visible=!1,this.panel.classList.add("sv-hidden"),this.settingsPanel.classList.add("sv-hidden"),setTimeout(()=>this.showOverlay(),300)}showToast(t,e=3e3){const i=l("div","sv-toast");i.textContent=t,this.toastEl.appendChild(i),requestAnimationFrame(()=>i.classList.add("sv-toast-visible")),setTimeout(()=>{i.classList.remove("sv-toast-visible"),i.addEventListener("transitionend",()=>i.remove()),setTimeout(()=>i.remove(),500)},e)}setLoading(t,e){t?(this.generateBtn.disabled=!0,this.generateBtn.innerHTML=`${Z} ${e||"Generating..."}`):(this.generateBtn.disabled=!1,this.generateBtn.textContent="Generate")}setMicActive(t){this.micBtn.innerHTML=t?K:P,this.micBtn.classList.toggle("sv-active",t)}setMusicActive(t){this.musicBtn.classList.toggle("sv-active",t)}showOverlay(){this.visible=!0,this.panel.classList.remove("sv-hidden"),this.settingsOpen&&this.settingsPanel.classList.remove("sv-hidden"),this.resetAutoHide()}hideOverlay(){this.visible=!1,this.panel.classList.add("sv-hidden"),this.settingsPanel.classList.add("sv-hidden"),clearTimeout(this.hideTimer)}toggleOverlay(){this.visible?this.hideOverlay():this.showOverlay()}toggleSettings(){this.settingsOpen=!this.settingsOpen,this.settingsPanel.classList.toggle("sv-hidden",!this.settingsOpen)}resetAutoHide(){clearTimeout(this.hideTimer),this.hideTimer=window.setTimeout(()=>this.hideOverlay(),j)}injectStyles(){const t=document.createElement("style");t.textContent=Q,document.head.appendChild(t)}}function l(r,t){const e=document.createElement(r);return t&&(e.className=t),e}const P=`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="1" y1="1" x2="23" y2="23"/>
  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/>
  <line x1="12" y1="19" x2="12" y2="23"/>
  <line x1="8" y1="23" x2="16" y2="23"/>
</svg>`,K=`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
  <line x1="12" y1="19" x2="12" y2="23"/>
  <line x1="8" y1="23" x2="16" y2="23"/>
</svg>`,X=`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M9 18V5l12-2v13"/>
  <circle cx="6" cy="18" r="3"/>
  <circle cx="18" cy="16" r="3"/>
</svg>`,$=`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="3"/>
  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
</svg>`,Z='<svg class="sv-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>',Q=`
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
`,J="https://api.openai.com/v1/images/generations";async function tt(r,t){const e=`Highly detailed, cinematic, ${r}`,i=await fetch(J,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({model:"dall-e-3",prompt:e,n:1,size:"1024x1024",quality:"standard",response_format:"b64_json"})});if(!i.ok){const a=await i.text();throw i.status===401?new Error("Invalid OpenAI API key"):i.status===429?new Error("Rate limit — try again shortly"):new Error(`OpenAI API error ${i.status}: ${a.slice(0,200)}`)}const o=(await i.json()).data?.[0]?.b64_json;if(!o)throw new Error("No image data returned from DALL-E");return et(o)}function et(r){return new Promise((t,e)=>{const i=new Image;i.onload=()=>t(i),i.onerror=()=>e(new Error("Failed to decode generated image")),i.src=`data:image/png;base64,${r}`})}function it(r,t){const e=new Float32Array(r*t),i=r/2,s=t/2,o=Math.sqrt(i*i+s*s);for(let a=0;a<t;a++)for(let h=0;h<r;h++){const p=h-i,u=a-s,d=Math.sqrt(p*p+u*u);e[a*r+h]=1-d/o}return e}function st(r,t,e=2){const i=document.createElement("canvas"),s=r.naturalWidth||r.width,o=r.naturalHeight||r.height;i.width=s,i.height=o;const a=i.getContext("2d");a.drawImage(r,0,0,s,o);const p=a.getImageData(0,0,s,o).data,u=Math.floor(s/e),d=Math.floor(o/e),f=u*d,v=new Float32Array(f*3),g=new Float32Array(f*3);let m=0;for(let c=0;c<d;c++)for(let b=0;b<u;b++){const y=b*e,x=c*e,k=y/s*2-1,L=-(x/o*2-1),B=x*s+y,I=t[B]-.5;v[m*3]=k,v[m*3+1]=L,v[m*3+2]=I;const w=(x*s+y)*4;g[m*3]=p[w]/255,g[m*3+1]=p[w+1]/255,g[m*3+2]=p[w+2]/255,m++}return{positions:v,colors:g,count:f}}const S=[{name:"Cosmic Ocean",description:"Blue/purple fluid simulation — bass drives wave amplitude",source:`#version 300 es
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
}`}],nt=`#version 300 es
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
`;class ot{constructor(){n(this,"audio");n(this,"renderer");n(this,"pointRenderer");n(this,"camera");n(this,"ui");n(this,"intensity",.5);n(this,"coherence",.8);n(this,"mode","shader");n(this,"startTime",0);n(this,"running",!1);n(this,"pointCanvas",null);n(this,"loop",()=>{if(!this.running)return;const t=this.audio.getUniforms(),i=performance.now()/1e3-this.startTime;if(this.mode==="pointcloud"&&this.pointRenderer.hasCloud){this.pointRenderer.resize();const s=this.pointCanvas,o=s.clientWidth/s.clientHeight||1,a=Math.max(0,this.coherence-t.u_beat*.3),h=Math.max(2,Math.min(6,s.clientWidth/300));this.pointRenderer.render({projection:this.camera.getProjectionMatrix(o),view:this.camera.getViewMatrix(),time:i,bass:t.u_bass,mid:t.u_mid,high:t.u_high,beat:t.u_beat,coherence:a,pointScale:h})}else{const s={u_time:i,u_bass:t.u_bass,u_mid:t.u_mid,u_high:t.u_high,u_beat:t.u_beat,u_intensity:this.intensity,u_resolution:[window.innerWidth,window.innerHeight]};this.renderer.render(s)}requestAnimationFrame(this.loop)});this.audio=new F,this.renderer=new H,this.pointRenderer=new V,this.camera=new N,this.ui=new W}async init(){const t=document.getElementById("canvas");if(!t)throw new Error("Canvas element not found");this.renderer.init(t,nt),this.renderer.onError=s=>this.ui.showToast(s,4e3),this.initPointCanvas(),this.camera.attach(this.pointCanvas),this.ui.init(),this.wireUI();const e=localStorage.getItem("shader-visuals-intensity");e!==null&&(this.intensity=parseFloat(e));const i=localStorage.getItem("shader-visuals-coherence");i!==null&&(this.coherence=parseFloat(i)),S.length>0&&this.renderer.crossfadeTo(S[0].source,300),this.setMode("shader"),this.startTime=performance.now()/1e3,this.running=!0,this.loop(),this.registerSW()}initPointCanvas(){this.pointCanvas=document.createElement("canvas"),this.pointCanvas.id="canvas-points",this.pointCanvas.style.cssText="position:fixed;top:0;left:0;width:100%;height:100%;display:none;",document.body.insertBefore(this.pointCanvas,document.body.firstChild),this.pointRenderer.init(this.pointCanvas),this.pointRenderer.onError=t=>this.ui.showToast(t,4e3)}setMode(t){this.mode=t;const e=document.getElementById("canvas");t==="pointcloud"?(e.style.display="none",this.pointCanvas&&(this.pointCanvas.style.display="block")):(e.style.display="block",this.pointCanvas&&(this.pointCanvas.style.display="none"))}wireUI(){this.ui.onGenerate=async(t,e)=>{const i=localStorage.getItem("shader-visuals-api-key")||"";if(!i){this.ui.showToast("Set your OpenAI API key in settings first",3e3);return}const s=t.trim()||"a beautiful landscape";this.ui.setLoading(!0,"Generating image...");try{const o=await tt(s,i);this.ui.setLoading(!0,"Estimating depth...");const a=o.naturalWidth||o.width,h=o.naturalHeight||o.height,p=it(a,h);this.ui.setLoading(!0,"Building point cloud...");const u=st(o,p,2);this.pointRenderer.setPointCloud(u),this.setMode("pointcloud"),this.ui.showToast("Point cloud ready",2e3)}catch(o){this.ui.showToast(`Failed: ${o.message}`,4e3)}finally{this.ui.setLoading(!1)}},this.ui.onPresetSelect=t=>{const e=S.find(i=>i.name===t);e&&(this.setMode("shader"),this.renderer.crossfadeTo(e.source))},this.ui.onIntensityChange=t=>{this.intensity=t,localStorage.setItem("shader-visuals-intensity",String(t))},this.ui.onCoherenceChange=t=>{this.coherence=t,localStorage.setItem("shader-visuals-coherence",String(t))},this.ui.onMicToggle=async()=>{if(this.audio.isActive&&this.audio.currentMode==="mic")this.audio.stop(),this.ui.setMicActive(!1),this.ui.setMusicActive(!1);else try{await this.audio.initMic(),this.ui.setMicActive(!0),this.ui.setMusicActive(!1)}catch{this.ui.showToast("Microphone access denied",3e3)}},this.ui.onMusicFile=t=>{try{this.audio.initFile(t),this.ui.setMusicActive(!0),this.ui.setMicActive(!1),this.ui.showToast(`Playing: ${t.name}`,2e3)}catch{this.ui.showToast("Failed to play audio file",3e3)}},this.ui.onApiKeyChange=t=>{localStorage.setItem("shader-visuals-api-key",t)}}async registerSW(){if("serviceWorker"in navigator){const t=await navigator.serviceWorker.getRegistrations();for(const i of t)await i.unregister();const e=await caches.keys();for(const i of e)await caches.delete(i)}}}const rt=new ot;rt.init().catch(r=>{console.error("Failed to initialize app:",r),document.body.innerHTML=`
    <div style="color:#fff;font-family:system-ui;padding:2rem;text-align:center;">
      <h1>Failed to start</h1>
      <p>${r.message||"Unknown error"}</p>
    </div>
  `});
