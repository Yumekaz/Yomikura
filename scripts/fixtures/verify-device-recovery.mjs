import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { progressHead } from './verify-progress-after-stop.mjs';

async function confirmAction(page, action, confirm) {
  await page.getByRole('button', { name: action, exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: confirm, exact: true }).click();
}

export async function verifyDeviceRecovery({ native, browser, origin, settings, mangaId, chapterId, stopServer, startServer, closeDesktop, chapterState, waitFor }) {
  const note = 'Original Windows fixture note held on this device.';
  await native.page.goto(`${native.base}/manga/${mangaId}`);
  await native.page.getByText('My notes', { exact: false }).click();
  await native.page.getByRole('textbox', { name: 'A note for Migration Story', exact: true }).fill(note);
  await expect(native.page.getByRole('status').filter({ hasText: 'Saved on this device' })).toBeVisible();
  await native.page.goto(`${native.base}/reader/${chapterId}`);
  await expect(native.page.getByRole('button', { name: 'Go to page 2', exact: true })).toHaveAttribute('aria-current', 'page');
  await stopServer();
  await native.page.getByRole('button', { name: 'Go to page 1', exact: true }).click();
  await waitFor('unsynced Windows reading position', async () => {
    const head = await progressHead(native.page, chapterId, origin);
    return head?.page === 1 && !head.acknowledged;
  });

  await native.page.goto(`${native.base}/settings/backup`);
  // Capture the exact Blob produced by the installed UI before the OS save dialog.
  await native.page.evaluate(() => {
    const createObjectURL = URL.createObjectURL.bind(URL), click = HTMLAnchorElement.prototype.click;
    const blobs = new Map();
    URL.createObjectURL = (blob) => {
      const url = createObjectURL(blob);
      if (blob.type === 'application/octet-stream') blobs.set(url, blob);
      return url;
    };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download.endsWith('.yomirecovery')) window.fixtureRecoveryFile = blobs.get(this.getAttribute('href'));
      else click.call(this);
    };
  });
  await native.page.getByRole('checkbox', { name: 'Include saved chapter pages from this device' }).check();
  await native.page.getByRole('button', { name: 'Export device recovery', exact: true }).click();
  const exported = await waitFor('recovery file created by the installed app', () => native.page.evaluate(async () => {
    if (!window.fixtureRecoveryFile) return undefined;
    return Array.from(new Uint8Array(await window.fixtureRecoveryFile.arrayBuffer()));
  }));
  await closeDesktop();
  await startServer('recovery-target');
  assert.equal((await chapterState(chapterId)).lastPageRead, 1, 'The Windows device update must still be pending');

  const clean = await browser.newPage({ serviceWorkers: 'block' });
  try {
    await clean.addInitScript((serialized) => {
      if (!localStorage.getItem('yomikura-settings')) localStorage.setItem('yomikura-settings', serialized);
    }, settings);
    await clean.goto(`${origin}/settings/backup`);
    await waitFor('clean browser verified the fixture library', () => clean.evaluate((address) =>
      Boolean(JSON.parse(localStorage.getItem('yomikura-library-sessions-v1') ?? '{}')[address]?.marker), origin));
    await clean.getByLabel('Open recovery file').setInputFiles({ name: 'windows-fixture.yomirecovery', mimeType: 'application/octet-stream', buffer: Buffer.from(exported) });
    await expect(clean.getByText('1 note · 1 reading update · 1 saved chapter', { exact: false })).toBeVisible();
    await clean.reload();
    await confirmAction(clean, 'Apply recovered preferences', 'Apply preferences');
    await expect(clean.getByRole('button', { name: 'Restore earlier preferences' })).toBeVisible();
    await confirmAction(clean, 'Restore notes and saved chapters', 'Restore device records');
    await expect(clean.getByRole('button', { name: 'Device records restored' })).toBeDisabled();
    assert.equal((await chapterState(chapterId)).lastPageRead, 1, 'Importing the archive must not write progress before review');

    await confirmAction(clean, 'Review progress for Chapter 1', 'Apply saved update');
    await waitFor('reviewed Windows progress stored by Suwayomi', async () => (await chapterState(chapterId)).lastPageRead === 0);
    await clean.goto(`${origin}/manga/${mangaId}`);
    await clean.getByText('My notes', { exact: false }).click();
    await expect(clean.getByRole('textbox', { name: 'A note for Migration Story', exact: true })).toHaveValue(note);
    await clean.route(`${origin}/api/**`, (route) => route.abort('connectionrefused'));
    await clean.goto(`${origin}/reader/${chapterId}`);
    const recovered = clean.locator('[id^="reader-page-"]').getByRole('img', { name: 'Page 1', exact: true });
    await expect(recovered).toHaveAttribute('src', /^blob:/, { timeout: 45000 });
    await expect(recovered).toHaveCSS('opacity', '1');
  } finally { await clean.close(); }
}
