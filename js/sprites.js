// Procedural pixel-art sprite drawing helpers

// Draw a pixel-art player ship at (cx, cy), facing up
export function drawPlayer(ctx, cx, cy, color1 = '#fff', color2 = '#f44') {
  const p = [
    [0,0,0,0,1,0,0,0,0],
    [0,0,0,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,0,0],
    [0,1,1,2,1,2,1,1,0],
    [1,1,1,1,1,1,1,1,1],
    [1,0,1,2,1,2,1,0,1],
    [1,0,0,0,1,0,0,0,1],
  ];
  drawPixelMap(ctx, p, cx - 4, cy - 3, { 1: color1, 2: color2 });
}

// Draw tractor beam — downward cone from (bx, by)
export function drawTractorBeam(ctx, bx, by, width, height, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const grad = ctx.createLinearGradient(bx, by, bx, by + height);
  grad.addColorStop(0, '#ffe000');
  grad.addColorStop(0.5, '#cc00ff');
  grad.addColorStop(1, 'rgba(100,0,200,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx - width / 2, by + height);
  ctx.lineTo(bx + width / 2, by + height);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Draw a bee enemy (cyan/blue) at (cx, cy)
export function drawBee(ctx, cx, cy) {
  const p = [
    [0,1,0,1,0,1,0,1,0],
    [1,1,1,1,1,1,1,1,1],
    [1,2,1,1,1,1,1,2,1],
    [0,1,1,2,2,2,1,1,0],
    [0,0,1,1,1,1,1,0,0],
    [0,1,0,1,1,1,0,1,0],
  ];
  drawPixelMap(ctx, p, cx - 4, cy - 3, { 1: '#0cf', 2: '#fff' });
}

// Draw a butterfly enemy (red/white) at (cx, cy)
export function drawButterfly(ctx, cx, cy) {
  const p = [
    [1,0,0,0,1,0,0,0,1],
    [1,1,0,1,1,1,0,1,1],
    [0,1,1,1,1,1,1,1,0],
    [0,1,2,2,1,2,2,1,0],
    [0,0,1,1,1,1,1,0,0],
    [0,0,0,1,0,1,0,0,0],
  ];
  drawPixelMap(ctx, p, cx - 4, cy - 3, { 1: '#f33', 2: '#fff' });
}

// Draw a boss galaga (green/red) at (cx, cy). phase 0=full, 1=damaged
export function drawBoss(ctx, cx, cy, damaged = false) {
  const p = [
    [0,0,1,0,1,0,1,0,0],
    [0,1,1,1,1,1,1,1,0],
    [0,1,2,1,1,1,2,1,0],
    [1,1,1,3,1,3,1,1,1],
    [1,1,1,1,1,1,1,1,1],
    [1,2,1,1,1,1,1,2,1],
    [0,1,1,1,1,1,1,1,0],
    [0,0,1,0,0,0,1,0,0],
  ];
  const c2 = damaged ? '#f80' : '#f44';
  drawPixelMap(ctx, p, cx - 4, cy - 4, { 1: '#0f0', 2: c2, 3: '#ff0' });
}

// Draw bullet at (cx, cy), color
export function drawBullet(ctx, cx, cy, color = '#ff0') {
  ctx.fillStyle = color;
  ctx.fillRect(cx - 1, cy - 3, 2, 6);
}

// Draw enemy bullet
export function drawEnemyBullet(ctx, cx, cy) {
  ctx.fillStyle = '#f80';
  ctx.fillRect(cx - 1, cy - 3, 2, 6);
}

// Small life icon in the HUD
export function drawLifeIcon(ctx, x, y) {
  const p = [
    [0,0,1,0,1,0,0],
    [0,1,1,1,1,1,0],
    [1,1,2,1,2,1,1],
    [1,1,1,1,1,1,1],
    [0,1,0,1,0,1,0],
  ];
  drawPixelMap(ctx, p, x, y, { 1: '#fff', 2: '#f44' });
}

// Generic pixel map renderer
// map: 2D array of ints, colorMap: { int: cssColor }
function drawPixelMap(ctx, map, originX, originY, colorMap, scale = 1) {
  for (let row = 0; row < map.length; row++) {
    for (let col = 0; col < map[row].length; col++) {
      const v = map[row][col];
      if (v === 0) continue;
      ctx.fillStyle = colorMap[v] || '#fff';
      ctx.fillRect(
        Math.round(originX + col * scale),
        Math.round(originY + row * scale),
        scale,
        scale
      );
    }
  }
}
