import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';

const CHROME = '/usr/bin/google-chrome';
const PORT = 9234;

async function main() {
  // Start vite preview
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: '/home/gray/Developer/shader-visuals',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve) => {
    server.stdout.on('data', (d) => {
      if (d.toString().includes('http')) setTimeout(resolve, 500);
    });
  });

  // Launch with REAL GPU, headless=new (uses GPU if available)
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--enable-gpu',
      '--use-gl=desktop',
      '--enable-features=Vulkan',
    ],
  });

  const page = await browser.newPage();
  const errors = [];
  const logs = [];
  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));

  await page.goto(`http://localhost:${PORT}/shader-visuals/`, { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  // Check WebGL
  const info = await page.evaluate(() => {
    const c = document.getElementById('canvas');
    if (!c) return { error: 'NO CANVAS' };
    const gl = c.getContext('webgl2');
    if (!gl) return { error: 'NO WEBGL2' };
    const pixel = new Uint8Array(4);
    gl.readPixels(gl.drawingBufferWidth/2|0, gl.drawingBufferHeight/2|0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return {
      ok: true,
      size: `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`,
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      centerPixel: Array.from(pixel),
      bodyHTML: document.body.innerHTML.slice(0, 500),
    };
  });
  
  console.log('\n=== WebGL Info ===');
  console.log(JSON.stringify(info, null, 2));
  
  console.log('\n=== Console ===');
  logs.forEach(l => console.log(l));
  
  if (errors.length) {
    console.log('\n=== ERRORS ===');
    errors.forEach(e => console.log('❌', e));
  }

  await page.screenshot({ path: '/home/gray/Developer/shader-visuals/test-screenshot.png' });
  console.log('\nScreenshot saved');

  await browser.close();
  server.kill();
}

main().catch(e => { console.error(e); process.exit(1); });
