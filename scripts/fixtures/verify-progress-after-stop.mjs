import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { expect } from '@playwright/test';

export async function progressHead(page, chapterId, origin) {
  return page.evaluate(async ({ chapterId, origin }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('yomikura-progress');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const row = await new Promise((resolve, reject) => {
        const tx = db.transaction('heads', 'readonly');
        const request = tx.objectStore('heads').getAll();
        request.onsuccess = () => resolve(request.result.find((head) => head.chapter.chapterId === chapterId && head.backend.serverBaseUrl === origin));
        request.onerror = () => reject(request.error);
      });
      return row && { page: row.patch.lastPageRead + 1, acknowledged: row.sequence === row.acknowledgedSequence };
    } finally {
      db.close();
    }
  }, { chapterId, origin });
}

export async function verifyProgressAfterStop({ clients, chapterId, origin, readServerChapter, restartServer, stopServer, waitFor, outcomes }) {
  const endpoint = `${origin}/api/graphql`;
  const readServerPage = async () => (await readServerChapter()).lastPageRead + 1;
  await restartServer('progress-setup');

  for (const { name, page, base } of clients) {
    const reader = `${base}/reader/${chapterId}`;
    const marker = page.getByRole('button', { name: /^Go to page \d+$/ }).and(page.locator('[aria-current="page"]'));

    for (const stopAt of ['pending', 'acknowledged']) {
      const outcome = { client: name, stopAt };
      outcomes.push(outcome);
      await page.goto(reader);
      const first = page.getByRole('button', { name: 'Go to page 1', exact: true });
      await first.click({ timeout: 45000 });
      await expect(first).toHaveAttribute('aria-current', 'page');
      await waitFor('page 1 acknowledged before the test', async () => (await readServerPage()) === 1);
      await delay(1500);

      let intercepted = false;
      let interruption;
      let interruptionError;
      const interrupt = async (route) => {
        const request = route.request();
        if (request.method() !== 'POST') return route.continue();
        const body = request.postDataJSON();
        const input = body?.variables?.input;
        if (!body?.query?.includes('mutation UpdateChapterProgress') || input?.id !== chapterId) return route.continue();
        if (intercepted) return route.abort('failed');
        if (input.patch?.lastPageRead !== 1) return route.continue();
        intercepted = true;
        interruption = (async () => {
          if (stopAt === 'pending') {
            await stopServer();
            await route.abort('failed');
            return;
          }
          const response = await route.fetch({ timeout: 12000, maxRetries: 0 });
          const result = await response.json();
          assert.ok(response.ok() && !result.errors?.length, JSON.stringify(result.errors));
          const chapter = result.data.updateChapter.chapter;
          outcome.wirePage = chapter.lastPageRead + 1;
          outcome.wireReadAt = chapter.lastReadAt;
          assert.equal(outcome.wirePage, 2);
          await stopServer();
          await route.fulfill({ response });
        })().catch(async (error) => {
          interruptionError = error;
          await route.abort('failed').catch(() => {});
        });
        await interruption;
      };

      await page.route(endpoint, interrupt);
      try {
        await page.getByRole('button', { name: 'Go to page 2', exact: true }).click();
        await waitFor(`page 2 writer reached the ${stopAt} interruption`, () => intercepted, 30000);
        await interruption;
        if (interruptionError) throw interruptionError;
        const ackExpected = stopAt === 'acknowledged';
        outcome.deviceBeforeRestart = await waitFor('device journal records the intended page and acknowledgment state', async () => {
          const head = await progressHead(page, chapterId, origin);
          return head?.page === 2 && head.acknowledged === ackExpected && head;
        }, 30000);
        await restartServer(`${name}-${stopAt}-restarted`);
        // Read the recovered database while this client is still blocked from sending progress.
        const chapter = await readServerChapter();
        outcome.serverAfterRestart = chapter.lastPageRead + 1;
        outcome.serverAfterRestartReadAt = chapter.lastReadAt;
      } finally {
        await page.unroute(endpoint, interrupt);
      }

      await page.goto(reader);
      await expect(marker).toBeVisible({ timeout: 45000 });
      outcome.readerAfterRestart = Number((await marker.getAttribute('aria-label')).match(/\d+$/)[0]);
      if (stopAt === 'pending') {
        assert.equal(outcome.serverAfterRestart, 1, 'The interrupted write must not have reached Suwayomi');
        if (outcome.readerAfterRestart === 2) {
          await waitFor('the original pending page is replayed after restart', async () => (await readServerPage()) === 2);
          outcome.pendingReplay = true;
        }
      }
      if (stopAt === 'acknowledged' && outcome.serverAfterRestart === 1 && outcome.readerAfterRestart === 2) {
        assert.ok(Number(outcome.serverAfterRestartReadAt) < Number(outcome.wireReadAt));
        const useSaved = page.getByRole('button', { name: 'Use saved progress', exact: true });
        await expect(useSaved).toBeVisible({ timeout: 45000 });
        assert.equal(await readServerPage(), 1, 'The server must remain untouched before review');
        await useSaved.click();
        await page.getByRole('alertdialog').getByRole('button', { name: 'Use saved progress', exact: true }).click();
        await waitFor('the reviewed page is stored on Suwayomi', async () => (await readServerPage()) === 2);
        outcome.reviewedReplay = true;
      }
      await page.goto(`${base}/library`);
    }
  }

  assert.deepEqual(outcomes.map(({ readerAfterRestart }) => readerAfterRestart), [2, 2, 2, 2], JSON.stringify(outcomes));
}
