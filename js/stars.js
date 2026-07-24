// Scrolling parallax starfield
export class Stars {
  constructor(width, height, count = 80) {
    this.width = width;
    this.height = height;
    this.layers = [
      { stars: [], speed: 20,  size: 1,   alpha: 0.5 },
      { stars: [], speed: 50,  size: 1,   alpha: 0.8 },
      { stars: [], speed: 100, size: 2,   alpha: 1.0 },
    ];

    for (const layer of this.layers) {
      const n = Math.floor(count / this.layers.length);
      for (let i = 0; i < n; i++) {
        layer.stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
        });
      }
    }
  }

  update(dt) {
    for (const layer of this.layers) {
      for (const s of layer.stars) {
        s.y += layer.speed * dt;
        if (s.y > this.height) {
          s.y = 0;
          s.x = Math.random() * this.width;
        }
      }
    }
  }

  draw(ctx) {
    for (const layer of this.layers) {
      ctx.globalAlpha = layer.alpha;
      ctx.fillStyle = '#fff';
      for (const s of layer.stars) {
        ctx.fillRect(Math.round(s.x), Math.round(s.y), layer.size, layer.size);
      }
    }
    ctx.globalAlpha = 1;
  }
}
