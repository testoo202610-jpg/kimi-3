// Two-browser multiplayer flow: lobby -> ready -> start -> a command issued by
// player 1 lands (server-stamped, lockstep) in player 2's simulation.
import { test, expect, type Page } from '@playwright/test';

async function enterLobby(page: Page, name: string, room: string, create: boolean) {
  await page.goto('/');
  await page.getByTestId('menu-multiplayer').click();
  await page.getByTestId('lobby-name').fill(name);
  await page.getByTestId('lobby-room').fill(room);
  await page.getByTestId(create ? 'lobby-create' : 'lobby-join').click();
  await expect(page.getByTestId('lobby-players')).toContainText(name, { timeout: 10_000 });
}

test('mp flow: two players in one room see the same world obey both', async ({ browser }) => {
  test.setTimeout(240_000); // two full world boots on shared CPU
  const room = `e2e${Date.now() % 1000000}`;
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();
  for (const [tag, pg] of [['P1', p1], ['P2', p2]] as const) {
    pg.on('pageerror', (e) => console.log(tag, 'PAGEERROR', e.message));
    pg.on('console', (m) => { if (m.type() === 'error') console.log(tag, 'CONSOLE', m.text().slice(0, 200)); });
  }

  await enterLobby(p1, 'alice', room, true);
  await enterLobby(p2, 'bob', room, false);
  // both see each other
  await expect(p1.getByTestId('lobby-players')).toContainText('bob');
  await expect(p2.getByTestId('lobby-players')).toContainText('alice');

  await p1.getByTestId('lobby-ready').click();
  await p2.getByTestId('lobby-ready').click();
  // wait until the HOST sees both players ready (server-processed) before starting
  await expect(p1.getByTestId('lobby-players').locator('div', { hasText: '✓ ready' })).toHaveCount(2, { timeout: 15_000 });
  await p1.getByTestId('lobby-start').click();

  for (const p of [p1, p2]) {
    await expect(p.locator('#game canvas').first()).toBeVisible({ timeout: 30_000 });
    await p.waitForFunction(() => (window as any).__cr_scene?.world != null);
  }

  // p1 owns slot 0, p2 owns slot 1
  expect(await p1.evaluate(() => (window as any).__cr_scene.playerId)).toBe(0);
  expect(await p2.evaluate(() => (window as any).__cr_scene.playerId)).toBe(1);

  // p1 orders a worker to a nearby walkable, unoccupied tile
  const job = await p1.evaluate(() => {
    const sc = (window as any).__cr_scene;
    const w = sc.world;
    const worker = [...w.units.values()].find((u: any) => u.owner === sc.playerId && u.type === 'worker');
    if (!worker) return null;
    // spiral outward from the worker until a walkable tile with no building footprint is found
    const free = (tx: number, ty: number) => {
      if (tx < 0 || ty < 0 || tx >= w.map.w || ty >= w.map.h) return false;
      const t = w.map.tiles[ty * w.map.w + tx];
      if (t === 2 || t === 3) return false;
      for (const b of w.buildings.values() as any) {
        const def = { w: b.key === 'townCenter' ? 3 : 2, h: b.key === 'townCenter' ? 3 : 2 };
        if (tx >= b.tx && tx < b.tx + def.w && ty >= b.ty && ty < b.ty + def.h) return false;
      }
      return true;
    };
    for (let r = 2; r < 12; r++) {
      for (const [dx, dy] of [[r, 0], [0, r], [-r, 0], [0, -r], [r, r], [r, -r], [-r, r], [-r, -r]]) {
        const tx = worker.tx + dx;
        const ty = worker.ty + dy;
        if (free(tx, ty)) {
          sc.issue({ type: 'move', player: sc.playerId, unitIds: [worker.id], tx, ty });
          return { id: worker.id as number, x0: worker.x as number };
        }
      }
    }
    return null;
  });
  expect(job).not.toBeNull();

  // the same unit must move in p2's world as well (server-authoritative echo)
  await p2.waitForFunction(
    ({ id, x0 }) => {
      const u = (window as any).__cr_scene.world.units.get(id);
      return u && Math.abs(u.x - x0) > 8;
    },
    job!,
    { timeout: 90_000 },
  );

  await ctx1.close();
  await ctx2.close();
});
