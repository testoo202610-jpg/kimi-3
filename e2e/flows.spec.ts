// Playwright talks to the live world through the window bridge (__cr_scene) —
// game-core objects are plain maps/classes, typed access lives inside the app.
import { test, expect, type Page } from '@playwright/test';

/** Boot a deterministic skirmish (fixed seed) and wait until the world exists. */
async function newGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('menu-new-game').click();
  await page.getByTestId('faction-dominion').click();
  await page.getByTestId('difficulty-easy').click();
  await page.getByTestId('seed-input').fill('4242');
  await page.getByTestId('setup-start').click();
  await expect(page.locator('#game canvas').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => (window as any).__cr_scene?.world != null);
}

test('flow: new game boots a world with units and buildings', async ({ page }) => {
  await newGame(page);
  const counts = await page.evaluate(() => {
    const w = (window as any).__cr_scene.world;
    return { units: w.units.size as number, buildings: w.buildings.size as number };
  });
  expect(counts.units).toBeGreaterThan(0);
  expect(counts.buildings).toBeGreaterThan(0);
});

test('flow: place building — build command erects a house', async ({ page }) => {
  await newGame(page);
  const placed = await page.evaluate(async () => {
    const sc = (window as any).__cr_scene;
    const w = sc.world;
    const pid = sc.playerId;
    const worker = [...w.units.values()].find((u: any) => u.owner === pid && u.type === 'worker');
    if (!worker) return 'no worker';
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const n0 = w.buildings.size;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    for (let r = 4; r < 30; r += 2) {
      for (const [dx, dy] of dirs) {
        w.enqueue({ type: 'build', player: pid, unitIds: [worker.id], key: 'house', tx: worker.tx + dx * r, ty: worker.ty + dy * r });
        await sleep(300);
        if (w.buildings.size > n0) return 'placed';
      }
    }
    return 'no tile';
  });
  expect(placed).toBe('placed');
});

test('flow: train unit — town center queues a worker', async ({ page }) => {
  await newGame(page);
  const townId = await page.evaluate(() => {
    const sc = (window as any).__cr_scene;
    const w = sc.world;
    const pid = sc.playerId;
    const town = [...w.buildings.values()].find((b: any) => b.owner === pid && b.key === 'townCenter');
    if (!town) return -1;
    w.enqueue({ type: 'train', player: pid, buildingId: town.id, unitKey: 'worker' });
    return town.id as number;
  });
  expect(townId).toBeGreaterThan(-1);
  await page.waitForFunction(
    (id) => ((window as any).__cr_scene.world.buildings.get(id)?.queue.length ?? 0) > 0,
    townId,
    { timeout: 15_000 },
  );
});

test('flow: move order — unit walks to the commanded tile', async ({ page }) => {
  await newGame(page);
  const job = await page.evaluate(() => {
    const sc = (window as any).__cr_scene;
    const w = sc.world;
    const pid = sc.playerId;
    const worker = [...w.units.values()].find((u: any) => u.owner === pid && u.type === 'worker');
    const town = [...w.buildings.values()].find((b: any) => b.owner === pid && b.key === 'townCenter');
    if (!worker || !town) return null;
    // target: tile next to the town center, on the worker's side — always reachable
    const dx = Math.sign(worker.tx - town.tx) || 1;
    const tx = town.tx + 2 + dx;
    const ty = town.ty + 1;
    w.enqueue({ type: 'move', player: pid, unitIds: [worker.id], tx, ty });
    return { id: worker.id as number, x0: worker.x as number };
  });
  expect(job).not.toBeNull();
  await page.waitForFunction(
    ({ id, x0 }) => {
      const u = (window as any).__cr_scene.world.units.get(id);
      return u && Math.abs(u.x - x0) > 8; // visibly walking toward the town center
    },
    job!,
    { timeout: 20_000 },
  );
});
