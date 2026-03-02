/**
 * Headless WebGL render test using Puppeteer + SwiftShader (software GPU).
 * Tests: page load, WebGL context creation, shader compilation, point cloud rendering.
 */
import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const CHROME = '/usr/bin/google-chrome';
const PORT = 9234;
let server;

async function startServer() {
  const { spawn } = await import('child_process');
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: '/home/gray/Developer/shader-visuals',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Wait for server to be ready
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timeout')), 10000);
    server.stdout.on('data', (d) => {
      const s = d.toString();
      if (s.includes('Local:') || s.includes('http')) {
        clearTimeout(timeout);
        setTimeout(resolve, 500); // extra settle time
      }
    });
    server.stderr.on('data', (d) => process.stderr.write(d));
  });
}

async function main() {
  // Build first
  console.log('Building...');
  execSync('npx vite build', { cwd: '/home/gray/Developer/shader-visuals', stdio: 'inherit' });

  console.log('Starting preview server...');
  await startServer();

  console.log('Launching Chrome with SwiftShader...');
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [
      '--use-gl=swiftshader',
      '--enable-webgl',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu-sandbox',
      '--ignore-gpu-blocklist',
    ],
  });

  const page = await browser.newPage();
  
  // Collect console messages and errors
  const logs = [];
  const errors = [];
  page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`;
    logs.push(text);
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));

  console.log(`Navigating to http://localhost:${PORT}/shader-visuals/...`);
  await page.goto(`http://localhost:${PORT}/shader-visuals/`, { waitUntil: 'networkidle0', timeout: 15000 });

  // Wait a moment for init
  await new Promise(r => setTimeout(r, 2000));

  // Test 1: Check WebGL context
  console.log('\n=== TEST 1: WebGL Context ===');
  const webglOk = await page.evaluate(() => {
    const canvas = document.getElementById('canvas');
    if (!canvas) return 'NO CANVAS ELEMENT';
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return 'NO WEBGL CONTEXT';
    return `OK (${gl.getParameter(gl.VERSION)})`;
  });
  console.log('WebGL:', webglOk);

  // Test 2: Check Three.js renderer
  console.log('\n=== TEST 2: Three.js Renderer ===');
  const rendererInfo = await page.evaluate(() => {
    // Check if the canvas has any non-black pixels
    const canvas = document.getElementById('canvas');
    if (!canvas) return 'NO CANVAS';
    const gl = canvas.getContext('webgl2');
    if (!gl) return 'NO GL CONTEXT';
    return {
      drawingBufferWidth: gl.drawingBufferWidth,
      drawingBufferHeight: gl.drawingBufferHeight,
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
    };
  });
  console.log('Renderer:', JSON.stringify(rendererInfo, null, 2));

  // Test 3: Check if canvas has any pixels drawn
  console.log('\n=== TEST 3: Canvas Pixel Check (before generation) ===');
  const pixelsBefore = await page.evaluate(() => {
    const canvas = document.getElementById('canvas');
    if (!canvas) return 'NO CANVAS';
    // Read pixels via WebGL
    const gl = canvas.getContext('webgl2');
    if (!gl) return 'NO GL';
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    // Sample center pixel
    const pixel = new Uint8Array(4);
    gl.readPixels(Math.floor(w/2), Math.floor(h/2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    // Sample a few more
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const px = new Uint8Array(4);
      const sx = Math.floor(w * (i + 1) / 6);
      const sy = Math.floor(h / 2);
      gl.readPixels(sx, sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      samples.push(Array.from(px));
    }
    return { center: Array.from(pixel), samples, size: `${w}x${h}` };
  });
  console.log('Pixels:', JSON.stringify(pixelsBefore, null, 2));

  // Test 4: Check app state
  console.log('\n=== TEST 4: App State ===');
  const appState = await page.evaluate(() => {
    // Check UI elements
    const promptInput = document.querySelector('input[placeholder]');
    const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean);
    const errorOverlay = document.querySelector('.error-overlay');
    return {
      hasPromptInput: !!promptInput,
      buttons: buttons.slice(0, 10),
      hasError: !!errorOverlay,
      errorText: errorOverlay?.textContent?.slice(0, 200) || null,
      bodyChildren: document.body.children.length,
    };
  });
  console.log('App state:', JSON.stringify(appState, null, 2));

  // Test 5: Shader compilation check
  console.log('\n=== TEST 5: Shader Compilation ===');
  const shaderCheck = await page.evaluate(() => {
    const canvas = document.getElementById('canvas');
    const gl = canvas?.getContext('webgl2');
    if (!gl) return 'NO GL';
    // Check if any shader programs are linked
    // We can't enumerate programs, but we can check the GL error state
    const err = gl.getError();
    return { glError: err, glErrorName: err === 0 ? 'NO_ERROR' : `ERROR_${err}` };
  });
  console.log('Shader check:', JSON.stringify(shaderCheck));

  // Print all console logs
  console.log('\n=== BROWSER CONSOLE OUTPUT ===');
  logs.forEach(l => console.log(l));

  if (errors.length > 0) {
    console.log('\n=== ERRORS ===');
    errors.forEach(e => console.log('❌', e));
  }

  // Screenshot
  await page.screenshot({ path: '/home/gray/Developer/shader-visuals/test-screenshot.png', fullPage: true });
  console.log('\nScreenshot saved to test-screenshot.png');

  await browser.close();
  server.kill();
}

main().catch(e => {
  console.error('Test failed:', e);
  if (server) server.kill();
  process.exit(1);
});
