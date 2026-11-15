export type LauncherRect = { left: number; right: number; top: number; bottom: number };

/** Move above intersecting floating surfaces, including stacks of widgets. */
export function launcherPlacement(base: LauncherRect, obstacles: LauncherRect[], ceiling: number, gap = 12) {
  let lift = 0;
  for (let pass = 0; pass <= obstacles.length; pass++) {
    const previous = lift;
    for (const obstacle of obstacles) {
      if (base.right <= obstacle.left || base.left >= obstacle.right) continue;
      if (base.bottom - lift <= obstacle.top - gap || base.top - lift >= obstacle.bottom + gap) continue;
      lift = Math.max(lift, base.bottom - obstacle.top + gap);
    }
    if (lift === previous) break;
  }
  return { lift: Math.max(0, lift), hidden: base.top - lift < ceiling };
}
