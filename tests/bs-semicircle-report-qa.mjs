import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = path.resolve('output/semicircle-verification');
const report = path.join(out, 'DEVELOPMENT_REPORT.html');
const context = JSON.parse(await fs.readFile(path.join(out, 'context.json'), 'utf8'));
for (const artifact of context.artifacts) {
  const bytes = await fs.readFile(path.join(out, artifact.local));
  assert.equal(bytes.length, artifact.size, artifact.local + ' size');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256, artifact.local + ' hash');
}
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
const requests = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('**/*', async route => {
  if (route.request().url().startsWith('file:')) return route.continue();
  requests.push(route.request().url());
  return route.abort();
});
const viewports = [{ name: 'desktop', width: 1440, height: 1080 }, { name: 'mobile', width: 390, height: 844 }];
const views = [];
try {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(pathToFileURL(report).href);
    for (const img of await page.locator('img').all()) await img.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
    const links = await page.locator('a[href]').evaluateAll(nodes => nodes.map(n => n.href));
    for (const url of links) {
      assert.ok(url.startsWith('file:'), 'Report links must remain local');
      assert.ok((await fs.stat(fileURLToPath(url))).isFile(), url);
    }
    const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, images: document.images.length }));
    assert.ok(layout.scrollWidth <= layout.width + 2, `${viewport.name} horizontal overflow`);
    assert.equal(layout.images, 9);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(out, `report-${viewport.name}.png`) });
    views.push({ viewport: viewport.name, status: 'PASS', ...layout, links: links.length });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  await fs.writeFile(path.join(out, 'report-qa-results.json'), JSON.stringify({ status: 'PASS', views, artifactHashesVerified: context.artifacts.length, errors, requests }, null, 2));
  console.log('PASS: report desktop/mobile, all local links/images and actual artifact hashes');
} finally {
  await browser.close();
}
