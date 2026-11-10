/*
 * 3D 场景：追光、木雕八音盒（盖状盒盖）、垫在下面的旧信封和信纸、会软软穿过机芯的纸带。
 * 所有贴图都是 canvas 现画的，没有图片素材。
 *
 * 世界坐标：x 向右，y 向上，z 朝向观众；桌面 y = 0。
 * 纸带沿一条固定的路径滑动：路径上的距离 d 以“读孔线”（机芯拨音的位置）为 0，向右为正。
 * 纸带前端（谱号那一头）在 d = head 处，播放时 head 不断变小，纸带就从右往左走。
 */
(function (root) {
  'use strict';
  var T = root.THREE;
  var MB = root.MB, MBNote = root.MBNote, MBAudio = root.MBAudio;

  var FONT_EN = '"Pinyon Script", "Snell Roundhand", "Segoe Script", cursive';
  var FONT_CN = '"LXGW WenKai", "STKaiti", "KaiTi", serif';

  var D = {
    bw: 2.3, bd: 1.6, bh: 0.9, t: 0.07, plinth: 0.07, floor: 0.08,
    lidH: 0.22, lidOut: 0.03, lidOpen: 1.86,
    tapeY: 0.30, cw: 0.11, rowH: 0.062, margin: 0.075,
    base: 0.006, table: 0.013
  };
  D.tapeW = 14 * D.rowH + 2 * D.margin;
  D.combX = D.bw / 2 - 0.29;
  D.rest = 0.05; // 静止时纸带前端在读孔线右边一点
  var SPOT = 0.47; // 追光半角

  // ---------- 小工具 ----------
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h));
    return c;
  }
  function tex(c, opts) {
    var t = new T.CanvasTexture(c);
    t.colorSpace = (opts && opts.linear) ? T.NoColorSpace : T.SRGBColorSpace;
    t.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;
    if (opts && opts.repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    return t;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  // ---------- 木纹 ----------
  function paintWood(g, w, h, o) {
    var r = rng(o.seed || 7);
    g.fillStyle = o.base || '#86532d';
    g.fillRect(0, 0, w, h);
    var i, x, y;
    for (i = 0; i < 9; i++) {
      y = r() * h; var bh = (0.05 + r() * 0.22) * h;
      var gr = g.createLinearGradient(0, y - bh, 0, y + bh);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(0.5, r() < 0.55 ? 'rgba(45,20,6,0.16)' : 'rgba(255,214,160,0.09)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, y - bh, w, bh * 2);
    }
    var n = Math.round(h / (o.fine || 2.6));
    for (i = 0; i < n; i++) {
      var y0 = r() * h, amp = 1.5 + r() * 6 * (o.wave || 1), f = 0.002 + r() * 0.006, ph = r() * 6;
      g.beginPath();
      for (x = -8; x <= w + 8; x += 8) {
        y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph * 2) * amp * 0.3;
        if (x < 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokeStyle = r() < 0.72 ? 'rgba(42,18,5,' + (0.05 + r() * 0.13) + ')' : 'rgba(255,222,176,' + (0.04 + r() * 0.08) + ')';
      g.lineWidth = 0.5 + r() * 1.6;
      g.stroke();
    }
    for (i = 0; i < w * h / 260; i++) {
      g.fillStyle = 'rgba(28,12,3,' + (r() * 0.16) + ')';
      g.fillRect(r() * w, r() * h, 1 + r() * 3, 1);
    }
  }

  // ---------- 木色 ----------
  // 一个底色推出整只盒子用到的几种木头：外板、腰线、内壁（浅一点）、端面（再浅一点、偏黄）、盖子内侧
  function shade(hex, k, mixHex, m) {
    var c = new T.Color(hex);
    c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k);
    if (mixHex) c.lerp(new T.Color(mixHex), m);
    return '#' + c.getHexString();
  }
  var WOOD = null;
  function woodSet(base) {
    return {
      base: base, plain: shade(base, 0.95), inner: shade(base, 1.22),
      endg: shade(base, 1.2, '#b08560', 0.18), lid: shade(base, 1.07)
    };
  }
  WOOD = woodSet('#84512b');

  function woodTexture(w, h, o) {
    var c = canvas(w, h);
    paintWood(c.getContext('2d'), c.width, c.height, o || {});
    var t = tex(c);
    return t;
  }

  // ---------- 阴刻 ----------
  // pathFn(ctx) 自己 beginPath 并描出路径。颜色层：下沿亮边 + 深色槽 + 上沿阴影；凹凸层：黑色 = 凹下去
  function carveStroke(g, b, pathFn, lw) {
    b.save(); b.lineCap = b.lineJoin = 'round'; b.strokeStyle = '#000'; b.lineWidth = lw; pathFn(b); b.stroke(); b.restore();
    g.save(); g.lineCap = g.lineJoin = 'round';
    g.translate(0, lw * 0.38); g.strokeStyle = 'rgba(255,212,158,0.30)'; g.lineWidth = lw; pathFn(g); g.stroke();
    g.translate(0, -lw * 0.38); g.strokeStyle = 'rgba(40,17,5,0.80)'; g.lineWidth = lw; pathFn(g); g.stroke();
    g.translate(0, -lw * 0.22); g.strokeStyle = 'rgba(14,5,1,0.45)'; g.lineWidth = lw * 0.45; pathFn(g); g.stroke();
    g.restore();
  }
  function carveFill(g, b, pathFn, depth) {
    var k = depth || 3;
    b.save(); b.fillStyle = '#000'; pathFn(b); b.fill(); b.restore();
    g.save();
    g.translate(0, k * 0.6); g.fillStyle = 'rgba(255,212,158,0.30)'; pathFn(g); g.fill();
    g.translate(0, -k * 0.6); g.fillStyle = 'rgba(42,18,5,0.78)'; pathFn(g); g.fill();
    g.restore();
  }
  function leaf(x, y, ang, len, wid) {
    return function (c) {
      c.beginPath();
      var ca = Math.cos(ang), sa = Math.sin(ang);
      function P(u, v) { return [x + u * ca - v * sa, y + u * sa + v * ca]; }
      var p0 = P(0, 0), c1 = P(len * 0.45, -wid), p1 = P(len, 0), c2 = P(len * 0.5, wid * 0.8);
      c.moveTo(p0[0], p0[1]); c.quadraticCurveTo(c1[0], c1[1], p1[0], p1[1]); c.quadraticCurveTo(c2[0], c2[1], p0[0], p0[1]);
    };
  }
  function spiral(x, y, r0, turns, dir, a0) {
    return function (c) {
      c.beginPath();
      var n = Math.round(turns * 40);
      for (var i = 0; i <= n; i++) {
        var t = i / n, a = (a0 || 0) + dir * t * turns * Math.PI * 2, r = r0 * (1 - t * 0.82);
        var px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (i) c.lineTo(px, py); else c.moveTo(px, py);
      }
    };
  }
  function rrect(x, y, w, h, r) {
    return function (c) {
      c.beginPath();
      c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
      c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
      c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
    };
  }
  function rosette(g, b, cx, cy, R, petals) {
    for (var k = 0; k < petals; k++) {
      var a = k / petals * Math.PI * 2 - Math.PI / 2;
      carveFill(g, b, leaf(cx + Math.cos(a) * R * 0.22, cy + Math.sin(a) * R * 0.22, a, R * 0.78, R * 0.3), 2.5);
    }
    carveFill(g, b, function (c) { c.beginPath(); c.arc(cx, cy, R * 0.16, 0, Math.PI * 2); }, 2);
  }

  // 卷草：从 (x0,y0) 向左伸出一枝，末端卷起来
  function scrollVine(g, b, x0, y0, s) {
    carveStroke(g, b, function (c) {
      c.beginPath(); c.moveTo(x0, y0);
      c.bezierCurveTo(x0 - 37 * s, y0 - 70 * s, x0 - 112 * s, y0 - 70 * s, x0 - 142 * s, y0 - 10 * s);
      c.bezierCurveTo(x0 - 170 * s, y0 + 47 * s, x0 - 236 * s, y0 + 61 * s, x0 - 264 * s, y0 + 11 * s);
    }, 5 * s);
    carveStroke(g, b, spiral(x0 - 238 * s, y0 - 4 * s, 30 * s, 1.15, 1, Math.PI * 0.95), 4.2 * s);
    carveStroke(g, b, spiral(x0 - 92 * s, y0 - 22 * s, 18 * s, 1.0, -1, Math.PI * 0.2), 3 * s);
    carveFill(g, b, leaf(x0 - 52 * s, y0 - 46 * s, -2.5, 46 * s, 13 * s), 2.5);
    carveFill(g, b, leaf(x0 - 160 * s, y0 + 28 * s, 2.2, 44 * s, 12 * s), 2.5);
    carveFill(g, b, leaf(x0 - 150 * s, y0 + 20 * s, -2.9, 36 * s, 10 * s), 2.5);
    carveFill(g, b, function (c) { c.beginPath(); c.arc(x0 - 120 * s, y0 + 30 * s, 5 * s, 0, Math.PI * 2); }, 2);
    carveFill(g, b, function (c) { c.beginPath(); c.arc(x0 - 108 * s, y0 + 42 * s, 3.6 * s, 0, Math.PI * 2); }, 2);
  }

  function fingerJoints(g, w, h, side) {
    var bands = 6, edge = Math.round(w * D.t / (side ? D.bd : D.bw));
    for (var k = 0; k < bands; k++) {
      var on = side ? k % 2 === 1 : k % 2 === 0;
      if (!on) continue;
      var y0 = h * k / bands, y1 = h * (k + 1) / bands;
      [0, w - edge].forEach(function (x0) {
        g.fillStyle = 'rgba(176,124,74,0.55)'; g.fillRect(x0, y0, edge, y1 - y0);
        g.strokeStyle = 'rgba(30,12,3,0.55)'; g.lineWidth = 1.5; g.strokeRect(x0 + 0.5, y0 + 0.5, edge - 1, y1 - y0 - 1);
        for (var i = 0; i < 3; i++) {
          g.strokeStyle = 'rgba(70,35,12,0.25)'; g.beginPath();
          g.arc(x0 + (x0 ? edge : 0), (y0 + y1) / 2, edge * (0.4 + i * 0.35), 0, Math.PI * 2); g.stroke();
        }
      });
    }
  }

  function panel(kind, worldW, worldH, seed) {
    var W = 1024, H = Math.round(W * worldH / worldW);
    var cc = canvas(W, H), bc = canvas(W, H);
    var g = cc.getContext('2d'), b = bc.getContext('2d');
    paintWood(g, W, H, { base: WOOD.base, seed: seed, fine: 2.4 });
    b.fillStyle = '#fff'; b.fillRect(0, 0, W, H);
    var inset = kind === 'front' ? 30 : 24;
    carveStroke(g, b, rrect(inset, inset, W - inset * 2, H - inset * 2, 14), 6);
    carveStroke(g, b, rrect(inset + 15, inset + 15, W - inset * 2 - 30, H - inset * 2 - 30, 9), 2.4);
    var cx = W / 2, cy = H / 2;
    if (kind === 'front') {
      carveStroke(g, b, function (c) { c.beginPath(); c.ellipse(cx, cy, 76, 58, 0, 0, Math.PI * 2); }, 5);
      rosette(g, b, cx, cy, 44, 8);
      [1, -1].forEach(function (m) {
        g.save(); b.save();
        if (m < 0) { g.translate(W, 0); g.scale(-1, 1); b.translate(W, 0); b.scale(-1, 1); }
        scrollVine(g, b, cx - 80, cy, 1.18);
        g.restore(); b.restore();
      });
      fingerJoints(g, W, H, false);
    } else if (kind === 'side') {
      var slotY = H * (1 - (D.tapeY - D.plinth) / (D.bh - D.plinth));
      rosette(g, b, cx, H * 0.36, 40, 6);
      [1, -1].forEach(function (m) {
        carveStroke(g, b, spiral(cx + m * 110, H * 0.37, 26, 1.1, m, m > 0 ? Math.PI : 0), 3.6);
        carveStroke(g, b, function (c) {
          c.beginPath(); c.moveTo(cx + m * 50, H * 0.36);
          c.bezierCurveTo(cx + m * 70, H * 0.22, cx + m * 110, H * 0.22, cx + m * 130, H * 0.31);
        }, 4);
      });
      // 进纸口
      var sw = W * (D.tapeW + 0.07) / (D.bd - 2 * D.t), sh = H * 0.042 / (D.bh - D.plinth);
      var gr = g.createLinearGradient(0, slotY - sh / 2, 0, slotY + sh / 2);
      gr.addColorStop(0, '#050201'); gr.addColorStop(0.7, '#1a0c05'); gr.addColorStop(1, '#2b170b');
      g.fillStyle = 'rgba(255,214,160,0.35)'; g.fillRect(cx - sw / 2, slotY + sh / 2, sw, 3);
      g.fillStyle = gr; g.fillRect(cx - sw / 2, slotY - sh / 2, sw, sh);
      b.fillStyle = '#000'; b.fillRect(cx - sw / 2, slotY - sh / 2, sw, sh);
      fingerJoints(g, W, H, true);
    }
    return { map: tex(cc), bump: tex(bc, { linear: true }) };
  }

  // ---------- 纸带贴图 ----------
  function tapeCanvas(box, L) {
    var PAPER = MB.colorOf('tape', box.tape).paper;
    var total = L.total;
    var ppc = clamp(Math.floor(4096 / total), 18, 48);
    var W = Math.ceil(total * ppc), H = Math.round(D.tapeW / D.cw * ppc);
    var c = canvas(W, H), g = c.getContext('2d');
    var rowPx = D.rowH / D.cw * ppc;
    function rowY(r) { return H - (D.margin / D.cw * ppc + (r - 1) * rowPx); }
    function uX(u) { return u * ppc; }

    // 纸
    g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
    var r = rng(11);
    for (var i = 0; i < W * H / 90; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(120,90,50,' + r() * 0.05 + ')' : 'rgba(255,255,255,' + r() * 0.12 + ')';
      g.fillRect(r() * W, r() * H, 1 + r() * 4, 1);
    }
    var eg = g.createLinearGradient(0, 0, 0, H);
    eg.addColorStop(0, 'rgba(150,115,70,0.22)'); eg.addColorStop(0.08, 'rgba(150,115,70,0)');
    eg.addColorStop(0.92, 'rgba(150,115,70,0)'); eg.addColorStop(1, 'rgba(150,115,70,0.22)');
    g.fillStyle = eg; g.fillRect(0, 0, W, H);

    var gridEnd = uX(L.dashU - 0.5);
    // 横线：音高（蓝灰）
    for (var row = 1; row <= MB.ROWS; row++) {
      var y = rowY(row);
      var isC = row === 1 || row === 8 || row === 15;
      g.strokeStyle = isC ? 'rgba(92,124,158,0.62)' : 'rgba(110,140,170,0.42)';
      g.lineWidth = Math.max(1, ppc * (isC ? 0.05 : 0.035));
      g.beginPath(); g.moveTo(uX(0.35), y); g.lineTo(gridEnd, y); g.stroke();
      g.strokeStyle = 'rgba(110,140,170,0.2)'; g.lineWidth = Math.max(1, ppc * 0.025);
      g.beginPath(); g.moveTo(uX(L.stampU - 1), y); g.lineTo(uX(L.total - 1), y); g.stroke();
    }
    // 竖线：时间（玫瑰色），每小节一条深一点
    var yTop = rowY(MB.ROWS) - rowPx * 0.4, yBot = rowY(1) + rowPx * 0.4;
    for (var x = 1; x < L.dashX; x++) {
      var bar = (x - 1) % box.colsPerBar === 0;
      g.strokeStyle = bar ? 'rgba(186,112,108,0.62)' : 'rgba(196,132,128,0.32)';
      g.lineWidth = Math.max(1, ppc * (bar ? 0.06 : 0.03));
      g.beginPath(); g.moveTo(uX(L.colU(x)), yTop); g.lineTo(uX(L.colU(x)), yBot); g.stroke();
    }

    // 高音谱号：旋涡绕在 G4（第 5 行）
    var s = rowPx / 6;
    g.save();
    g.translate(uX(1.0), rowY(5) - MBNote.CLEF_G_Y * s);
    g.scale(s, s);
    g.fillStyle = 'rgba(70,48,34,0.85)';
    g.fill(new Path2D(MBNote.CLEF_PATH));
    g.restore();

    var holeR = D.rowH * 0.4 / D.cw * ppc;
    var holes = [];
    box.melody.forEach(function (col) {
      col.rows.forEach(function (rw) { holes.push([uX(L.colU(col.x)), rowY(rw), holeR, 0]); });
    });
    box.stamp.forEach(function (d) { holes.push([uX(L.stampU + d.x - 1), rowY(d.y), holeR * 0.78, 1]); });

    // 孔边压痕与图形戳的金边
    holes.forEach(function (h) {
      g.beginPath(); g.arc(h[0], h[1], h[2] * 1.22, 0, Math.PI * 2);
      g.fillStyle = h[3] ? 'rgba(201,163,90,0.55)' : 'rgba(120,88,52,0.22)'; g.fill();
    });
    // 虚线（印刷的细线）
    var dx = uX(L.dashU);
    g.setLineDash([rowPx * 0.25, rowPx * 0.25]);
    g.strokeStyle = 'rgba(120,96,70,0.45)'; g.lineWidth = Math.max(1, ppc * 0.03);
    g.beginPath(); g.moveTo(dx + ppc * 0.22, H * 0.05); g.lineTo(dx + ppc * 0.22, H * 0.95); g.stroke();
    g.setLineDash([]);

    // 打孔：挖空
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    holes.forEach(function (h) { g.beginPath(); g.arc(h[0], h[1], h[2], 0, Math.PI * 2); g.fill(); });
    // 竖着的虚线孔
    var slotH = rowPx * 0.42, slotW = Math.max(2, ppc * 0.13), step = rowPx * 0.7;
    for (var yy = H * 0.07; yy < H * 0.93 - slotH; yy += step) {
      rrect(dx - slotW / 2, yy, slotW, slotH, slotW / 2)(g); g.fill();
    }
    // 四个内凹角
    var R = 0.085 / D.cw * ppc;
    [[0, 0], [W, 0], [0, H], [W, H]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], R, 0, Math.PI * 2); g.fill(); });
    g.restore();

    // 内凹角的一圈细边
    g.strokeStyle = 'rgba(150,115,70,0.4)'; g.lineWidth = 1.5;
    [[0, 0, 0], [W, 0, 0.5], [0, H, 1.5], [W, H, 1]].forEach(function (p) {
      g.beginPath(); g.arc(p[0], p[1], R + 1, p[2] * Math.PI, (p[2] + 0.5) * Math.PI); g.stroke();
    });

    return { canvas: c, ppc: ppc, rowPx: rowPx, rowY: rowY };
  }

  // ---------- 信封、信纸 ----------
  function envelopeTextures(box) {
    var W = 1024, H = Math.round(1024 * 2.6 / 4.2);
    var c = canvas(W, H), g = c.getContext('2d');
    var r = rng(5), pal = MB.colorOf('envelope', box.envelope);
    g.fillStyle = pal.env; g.fillRect(0, 0, W, H);
    for (var i = 0; i < 9000; i++) {
      g.fillStyle = 'rgba(110,80,45,' + r() * 0.06 + ')';
      g.fillRect(r() * W, r() * H, 1 + r() * 3, 1);
    }
    var vg = g.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(110,75,40,0.35)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    // 背面的折线（打开的口朝前，即贴图下边）
    g.strokeStyle = 'rgba(105,78,48,0.45)'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W * 0.45, H * 0.56); g.moveTo(W, 0); g.lineTo(W * 0.55, H * 0.56); g.stroke();
    g.beginPath(); g.moveTo(0, H); g.lineTo(W * 0.5, H * 0.46); g.lineTo(W, H); g.stroke();
    g.strokeStyle = 'rgba(255,248,230,0.35)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(2, H - 2); g.lineTo(W * 0.5, H * 0.46 + 2); g.lineTo(W - 2, H - 2); g.stroke();
    var env = tex(c);

    // 打开的封舌，内衬是深蓝底小金星
    var fc = canvas(1024, 300), f = fc.getContext('2d');
    f.fillStyle = pal.lining; f.fillRect(0, 0, 1024, 300);
    for (var y = 12; y < 300; y += 34) {
      for (var x = (y / 34) % 2 ? 0 : 17; x < 1024; x += 34) {
        f.fillStyle = 'rgba(214,180,110,0.75)';
        star4(f, x + r() * 3, y + r() * 3, 3.2 + r() * 1.6);
      }
    }
    f.strokeStyle = 'rgba(214,180,110,0.5)'; f.lineWidth = 3;
    f.beginPath(); f.moveTo(20, 0); f.lineTo(512, 282); f.lineTo(1004, 0); f.stroke();
    var flap = tex(fc);

    // 信纸
    var lc = canvas(800, 560), l = lc.getContext('2d');
    l.fillStyle = pal.letter; l.fillRect(0, 0, 800, 560);
    for (i = 0; i < 5000; i++) { l.fillStyle = 'rgba(120,90,50,' + r() * 0.04 + ')'; l.fillRect(r() * 800, r() * 560, 1 + r() * 3, 1); }
    l.strokeStyle = 'rgba(150,120,90,0.25)'; l.lineWidth = 1.2;
    for (y = 110; y < 540; y += 44) { l.beginPath(); l.moveTo(60, y); l.lineTo(740, y); l.stroke(); }
    // 信纸上端塞在信封里，露在外面的是下半张，所以落款写在最下面
    l.fillStyle = 'rgba(60,40,28,0.55)';
    l.font = '40px ' + FONT_EN; l.fillText('To', 62, 92);
    l.font = '30px ' + FONT_CN; l.fillText(box.to || '你', 112, 92);
    l.font = '24px ' + FONT_CN;
    var lines = wrapText(l, box.message || '', 660).slice(0, 8);
    lines.forEach(function (s, k) { l.fillText(s, 64, 146 + k * 44); });
    l.textAlign = 'right';
    l.font = '30px ' + FONT_CN; l.fillText(box.from || '我', 740, 520);
    var fw = l.measureText(box.from || '我').width;
    l.font = '40px ' + FONT_EN; l.fillText('From', 728 - fw, 520);
    l.textAlign = 'left';
    var letter = tex(lc);
    return { env: env, flap: flap, letter: letter };
  }

  function star4(g, x, y, s) {
    g.beginPath();
    g.moveTo(x, y - s); g.quadraticCurveTo(x, y, x + s, y); g.quadraticCurveTo(x, y, x, y + s);
    g.quadraticCurveTo(x, y, x - s, y); g.quadraticCurveTo(x, y, x, y - s); g.fill();
  }

  function wrapText(g, text, maxW) {
    var out = [];
    String(text).split('\n').forEach(function (para) {
      var line = '';
      Array.from(para).forEach(function (ch) {
        if (g.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; }
        else line += ch;
      });
      out.push(line);
    });
    return out;
  }

  // ---------- 盒盖内侧阴刻 ----------
  function engraveText(g, b, text, x, y, font, align) {
    [g, b].forEach(function (c) { c.font = font; c.textAlign = align || 'left'; c.textBaseline = 'alphabetic'; });
    b.fillStyle = '#000'; b.fillText(text, x, y);
    g.fillStyle = 'rgba(255,214,160,0.35)'; g.fillText(text, x, y + 2.5);
    g.fillStyle = 'rgba(46,22,8,0.9)'; g.fillText(text, x, y);
  }

  function fitFont(g, text, px, family, maxW) {
    g.font = px + 'px ' + family;
    var w = g.measureText(text).width;
    return w > maxW ? Math.floor(px * maxW / w) : px;
  }

  function lidTextures(box) {
    var iw = D.bw + 2 * D.lidOut - 0.12, id = D.bd + 2 * D.lidOut - 0.12;
    var W = 1024, H = Math.round(W * id / iw);
    var cc = canvas(W, H), bc = canvas(W, H);
    var g = cc.getContext('2d'), b = bc.getContext('2d');
    paintWood(g, W, H, { base: WOOD.lid, seed: 23, fine: 2.4 });
    b.fillStyle = '#fff'; b.fillRect(0, 0, W, H);
    var map = tex(cc), bump = tex(bc, { linear: true });

    function draw(staffImg) {
      carveStroke(g, b, rrect(36, 36, W - 72, H - 72, 18), 3.2);
      // 四角小卷
      [[60, 60, 1], [W - 60, 60, -1], [60, H - 60, -1], [W - 60, H - 60, 1]].forEach(function (p, k) {
        carveStroke(g, b, spiral(p[0] + (k % 2 ? -22 : 22), p[1] + (k < 2 ? 22 : -22), 18, 1.1, p[2], k * Math.PI / 2), 2.6);
      });
      var to = box.to || '你', from = box.from || '我';
      var y1 = H * 0.27;
      engraveText(g, b, 'To', 110, y1, '108px ' + FONT_EN);
      var f1 = fitFont(g, to, 78, FONT_CN, W - 340);
      engraveText(g, b, to, 236, y1, f1 + 'px ' + FONT_CN);
      // 阴刻的旋律：凹凸图画黑色，颜色图先画一道浅色下沿再画深色
      var sw = W - 200, sh = sw * 92 / 600, sy = H * 0.5 - sh / 2;
      MBNote.drawSVG(b, staffImg, 100, sy, sw, sh, { color: '#000' });
      g.save(); g.globalAlpha = 0.35; MBNote.drawSVG(g, staffImg, 100, sy + 2.5, sw, sh, { color: '#ffd4a0' }); g.restore();
      g.save(); g.globalAlpha = 0.92; MBNote.drawSVG(g, staffImg, 100, sy, sw, sh); g.restore();
      var y2 = H * 0.86;
      var f2 = fitFont(g, from, 64, FONT_CN, W * 0.5);
      g.font = f2 + 'px ' + FONT_CN;
      var nameW = g.measureText(from).width;
      engraveText(g, b, from, W - 110, y2, f2 + 'px ' + FONT_CN, 'right');
      engraveText(g, b, 'From', W - 130 - nameW, y2, '84px ' + FONT_EN, 'right');
      map.needsUpdate = true; bump.needsUpdate = true;
    }
    draw(MBNote.melodySVG(box, { width: 600, ink: '#2e1608', line: '#2e1608', meter: true }));
    return { map: map, bump: bump, ready: Promise.resolve() };
  }

  // ---------- 粒子贴图 ----------
  function glowTex() {
    var c = canvas(64, 64), g = c.getContext('2d');
    var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,210,0.6)');
    gr.addColorStop(1, 'rgba(255,220,170,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return tex(c);
  }
  function starTex() {
    var c = canvas(128, 128), g = c.getContext('2d');
    var gr = g.createRadialGradient(64, 64, 0, 64, 64, 40);
    gr.addColorStop(0, 'rgba(255,250,235,0.9)'); gr.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(255,248,225,1)';
    star4(g, 64, 64, 60);
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath(); g.arc(64, 64, 6, 0, Math.PI * 2); g.fill();
    return tex(c);
  }

  function SpritePool(texture, n, scene) {
    this.items = [];
    for (var i = 0; i < n; i++) {
      var m = new T.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, blending: T.AdditiveBlending, color: 0xffffff });
      var s = new T.Sprite(m); s.visible = false; s.renderOrder = 10;
      scene.add(s);
      this.items.push({ s: s, life: 0, age: 0, vel: new T.Vector3(), size: 0.1, delay: 0, spin: 0, peak: 1 });
    }
    this.i = 0;
  }
  SpritePool.prototype.spawn = function (pos, o) {
    var p = this.items[this.i]; this.i = (this.i + 1) % this.items.length;
    p.s.position.copy(pos); p.vel.copy(o.vel || new T.Vector3());
    p.life = o.life || 1; p.age = 0; p.size = o.size || 0.1; p.delay = o.delay || 0; p.spin = o.spin || 0;
    p.peak = o.peak || 1; p.grow = o.grow || 0;
    p.s.material.color.set(o.color || 0xffffff); p.s.material.rotation = Math.random() * Math.PI;
    p.s.visible = false;
    p.on = true;
  };
  SpritePool.prototype.update = function (dt) {
    this.items.forEach(function (p) {
      if (!p.on) return;
      if (p.delay > 0) { p.delay -= dt; return; }
      p.age += dt;
      if (p.age >= p.life) { p.on = false; p.s.visible = false; return; }
      var k = p.age / p.life;
      p.s.visible = true;
      p.s.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.pow(0.35, dt));
      var a = k < 0.15 ? k / 0.15 : Math.pow(1 - (k - 0.15) / 0.85, 1.6);
      p.s.material.opacity = a * p.peak;
      var sz = p.size * (1 + p.grow * k) * (0.6 + 0.4 * Math.min(1, k * 6));
      p.s.scale.set(sz, sz, 1);
      p.s.material.rotation += p.spin * dt;
    });
  };

  // ---------- 场景本体 ----------
  var renderer, scene, camera, clock;
  var boxGroup, lid, roller, starAxle, gear, crank, tapeMesh, tapeGeo, tapeMat, tapeDepth;
  var envGroup, envMeshes = {};
  var motes, sparks, glows, dust;
  var path = null;
  var state = { head: D.rest, mode: 'rest', box: null, layout: null, lidT: 0 };
  var view = { theta: 0.08, phi: 0.82, r: 7, target: new T.Vector3(0.2, 0.75, 0.05), baseR: 7, minR: 3.2, maxR: 14, offsetY: 0 };
  var lidMat;

  function init(cv) {
    renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
    renderer.setClearColor(0x05060a, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    scene = new T.Scene();
    scene.fog = new T.Fog(0x05060a, 9, 22);
    camera = new T.PerspectiveCamera(34, 1, 0.05, 80);
    clock = new T.Clock();

    lights();
    table();
    buildBox();
    buildPath();
    motes = new SpritePool(glowTex(), 120, scene);
    var st = starTex();
    sparks = new SpritePool(st, 260, scene);
    glows = new SpritePool(glowTex(), 140, scene);

    resize();
    root.addEventListener('resize', resize);
    controls(cv);
    renderer.setAnimationLoop(frame);
  }

  function lights() {
    scene.add(new T.HemisphereLight(0x5a5a70, 0x140c06, 0.5));
    var moon = new T.DirectionalLight(0x6f86c0, 0.35);
    moon.position.set(-6, 5, -4);
    scene.add(moon);

    // 暖光但别太橙，不然淡蓝淡绿的纸都会被染成米色
    var spot = new T.SpotLight(0xffe3c0, 4.0, 0, SPOT, 0.55, 0);
    spot.position.set(0.5, 8.6, 2.6);
    spot.target.position.set(0.05, 0, 0.35);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.camera.near = 4; spot.shadow.camera.far = 12;
    spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.015;
    spot.shadow.radius = 4;
    scene.add(spot); scene.add(spot.target);

    // 光柱：一个开口圆锥，加法混合，边缘和两头都淡出去
    var from = spot.position.clone(), to = spot.target.position.clone();
    var len = from.distanceTo(to);
    var rad = Math.tan(SPOT) * len * 0.8;
    var cone = new T.ConeGeometry(rad, len, 64, 1, true);
    cone.translate(0, -len / 2, 0);
    var mat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      uniforms: { uColor: { value: new T.Color(0xffd9a8) }, uLen: { value: len } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vH;' +
        'void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);' +
        ' vH = -position.y; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uLen; varying vec3 vN; varying vec3 vV; varying float vH;' +
        'void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);' +
        ' float h = vH / uLen; float a = f * smoothstep(0.0, 0.25, h) * (1.0 - smoothstep(0.7, 1.0, h)) * 0.085;' +
        ' gl_FragColor = vec4(uColor * a, a); }'
    });
    var beam = new T.Mesh(cone, mat);
    beam.position.copy(from);
    beam.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), to.clone().sub(from).normalize());
    beam.renderOrder = 5;
    scene.add(beam);

    // 光里的浮尘
    var n = 160, pos = new Float32Array(n * 3), seeds = [];
    for (var i = 0; i < n; i++) {
      var h = 0.6 + Math.random() * 6.4, rr = Math.sqrt(Math.random()) * Math.tan(SPOT) * (8.6 - h) * 0.7, a = Math.random() * Math.PI * 2;
      seeds.push({ h: h, r: rr, a: a, sp: 0.02 + Math.random() * 0.05, ph: Math.random() * 6 });
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    dust = new T.Points(geo, new T.PointsMaterial({
      size: 0.028, map: glowTex(), transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      color: 0xffe2b8, opacity: 0.55, sizeAttenuation: true
    }));
    dust.userData = { seeds: seeds, from: from, to: to };
    scene.add(dust);
  }

  function updateDust(t) {
    var u = dust.userData, a = dust.geometry.attributes.position.array;
    var axis = u.to.clone().sub(u.from).normalize();
    u.seeds.forEach(function (s, i) {
      var h = (s.h + t * s.sp) % 7 + 0.6;
      var ang = s.a + t * 0.05;
      var k = 1 - h / 8.6; // 0 在光源，1 在地面
      var c = u.from.clone().lerp(u.to, k);
      var rr = s.r * (1 + 0.1 * Math.sin(t * 0.3 + s.ph));
      a[i * 3] = c.x + Math.cos(ang) * rr + axis.x * 0;
      a[i * 3 + 1] = h + Math.sin(t * 0.4 + s.ph) * 0.05;
      a[i * 3 + 2] = c.z + Math.sin(ang) * rr;
    });
    dust.geometry.attributes.position.needsUpdate = true;
  }

  function table() {
    var c = canvas(512, 512), g = c.getContext('2d');
    var r = rng(3);
    g.fillStyle = '#2a1d17'; g.fillRect(0, 0, 512, 512);
    for (var i = 0; i < 26000; i++) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '0,0,0' : '90,60,45') + ',' + r() * 0.12 + ')'; g.fillRect(r() * 512, r() * 512, 1, 1); }
    var t = tex(c, { repeat: true }); t.repeat.set(10, 10);
    var ground = new T.Mesh(new T.CircleGeometry(30, 64), new T.MeshStandardMaterial({ map: t, roughness: 0.96, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  function wood(map, bump, o) {
    o = o || {};
    return new T.MeshStandardMaterial({
      map: map, bumpMap: bump || null, bumpScale: o.bumpScale || 1.6,
      roughness: o.roughness == null ? 0.52 : o.roughness, metalness: 0, color: o.color || 0xffffff
    });
  }

  function mesh(geo, mat, x, y, z, parent) {
    var m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    (parent || boxGroup).add(m);
    return m;
  }

  function buildBox() {
    boxGroup = new T.Group();
    boxGroup.position.y = D.base;
    scene.add(boxGroup);

    // 木头材质先建空的，贴图由 paintBoxWood() 按木色画（换木色时只重画贴图）
    var plain = wood(null), inner = wood(null, null, { roughness: 0.7 }), endg = wood(null, null, { roughness: 0.65 });
    var velvet = new T.MeshStandardMaterial({ color: 0x4a1622, roughness: 1, metalness: 0 });
    var brass = new T.MeshStandardMaterial({ color: 0xc09048, roughness: 0.32, metalness: 0.9 });
    var steel = new T.MeshStandardMaterial({ color: 0xaab0b8, roughness: 0.28, metalness: 0.9 });

    var wallH = D.bh - D.plinth, wy = D.plinth + wallH / 2;
    var front = wood(null), back = wood(null), side = wood(null);

    // 底座
    mesh(new T.BoxGeometry(D.bw + 0.1, D.plinth, D.bd + 0.1), [endg, endg, plain, plain, plain, plain], 0, D.plinth / 2, 0);
    // 绒布底
    mesh(new T.BoxGeometry(D.bw - 2 * D.t, D.floor, D.bd - 2 * D.t), velvet, 0, D.plinth + D.floor / 2, 0);
    // 四面墙：材质顺序 +x, -x, +y, -y, +z, -z
    mesh(new T.BoxGeometry(D.bw, wallH, D.t), [endg, endg, endg, endg, front, inner], 0, wy, D.bd / 2 - D.t / 2);
    mesh(new T.BoxGeometry(D.bw, wallH, D.t), [endg, endg, endg, endg, inner, back], 0, wy, -D.bd / 2 + D.t / 2);
    mesh(new T.BoxGeometry(D.t, wallH, D.bd - 2 * D.t), [side, inner, endg, endg, inner, inner], D.bw / 2 - D.t / 2, wy, 0);
    mesh(new T.BoxGeometry(D.t, wallH, D.bd - 2 * D.t), [inner, side, endg, endg, inner, inner], -D.bw / 2 + D.t / 2, wy, 0);
    // 腰线
    var my = D.bh - 0.13, mt = 0.03;
    mesh(new T.BoxGeometry(D.bw + 0.04, mt, mt), plain, 0, my, D.bd / 2 + 0.005);
    mesh(new T.BoxGeometry(D.bw + 0.04, mt, mt), plain, 0, my, -D.bd / 2 - 0.005);
    mesh(new T.BoxGeometry(mt, mt, D.bd + 0.04), plain, D.bw / 2 + 0.005, my, 0);
    mesh(new T.BoxGeometry(mt, mt, D.bd + 0.04), plain, -D.bw / 2 - 0.005, my, 0);

    // 机芯
    var cx = D.combX, ty = D.tapeY;
    mesh(new T.BoxGeometry(0.62, 0.025, 1.24), brass, cx - 0.18, D.plinth + D.floor + 0.0125, 0);
    mesh(new T.BoxGeometry(0.36, 0.13, 0.02), steel, cx - 0.04, ty - 0.02, 0.6);
    mesh(new T.BoxGeometry(0.36, 0.13, 0.02), steel, cx - 0.04, ty - 0.02, -0.6);
    mesh(new T.BoxGeometry(0.3, 0.02, 1.08), steel, cx - 0.3, ty - 0.065, 0); // 音梳底板
    roller = mesh(new T.CylinderGeometry(0.045, 0.045, 1.18, 28), brass, cx, ty - 0.049, 0);
    roller.rotation.x = Math.PI / 2;
    starAxle = new T.Group(); starAxle.position.set(cx + 0.005, ty + 0.033, 0); boxGroup.add(starAxle);
    var ax = mesh(new T.CylinderGeometry(0.011, 0.011, 1.22, 12), steel, 0, 0, 0, starAxle); ax.rotation.x = Math.PI / 2;
    for (var r = 1; r <= MB.ROWS; r++) {
      var z = D.tapeW / 2 - (D.margin + (r - 1) * D.rowH);
      var w = mesh(new T.CylinderGeometry(0.03, 0.03, 0.007, 8), steel, 0, 0, z, starAxle);
      w.rotation.x = Math.PI / 2;
    }
    gear = new T.Group(); gear.position.set(cx, ty - 0.049, -0.64); boxGroup.add(gear);
    mesh(gearGeometry(0.115, 0.095, 18, 0.016), brass, 0, 0, 0, gear);
    var hub = mesh(new T.CylinderGeometry(0.03, 0.03, 0.03, 16), steel, 0, 0, 0.005, gear); hub.rotation.x = Math.PI / 2;
    // 曲柄（右侧外面）
    crank = new T.Group(); crank.position.set(D.bw / 2 + 0.02, 0.63, -0.42); boxGroup.add(crank);
    var ca = mesh(new T.CylinderGeometry(0.018, 0.018, 0.1, 12), brass, 0.05, 0, 0, crank); ca.rotation.z = Math.PI / 2;
    mesh(new T.BoxGeometry(0.022, 0.24, 0.045), brass, 0.1, -0.1, 0, crank);
    var knob = mesh(new T.CylinderGeometry(0.032, 0.028, 0.11, 16), endg, 0.165, -0.2, 0, crank); knob.rotation.z = Math.PI / 2;
    // 合页与搭扣
    [-0.62, 0.62].forEach(function (x) {
      var h = mesh(new T.CylinderGeometry(0.022, 0.022, 0.22, 12), brass, x, D.bh, -D.bd / 2 - 0.012);
      h.rotation.z = Math.PI / 2;
    });
    mesh(new T.BoxGeometry(0.13, 0.085, 0.012), brass, 0, D.bh - 0.06, D.bd / 2 + 0.007);

    // 盒盖：浅浅的倒扣盒子，合页在后上沿
    lid = new T.Group();
    lid.position.set(0, D.bh, -D.bd / 2 - D.lidOut);
    boxGroup.add(lid);
    var lw = D.bw + 2 * D.lidOut, ld = D.bd + 2 * D.lidOut, lh = D.lidH, top = 0.06, rim = 0.06;
    var lidTop = wood(null);
    woodMats = { plain: plain, inner: inner, endg: endg, front: front, back: back, side: side, lidTop: lidTop, wallH: wallH, lw: lw, ld: ld };
    paintBoxWood();
    mesh(new T.BoxGeometry(lw, top, ld), [endg, endg, lidTop, inner, endg, endg], 0, lh - top / 2, ld / 2, lid);
    mesh(new T.BoxGeometry(lw, lh - top, rim), [endg, endg, endg, endg, plain, inner], 0, (lh - top) / 2, ld - rim / 2, lid);
    mesh(new T.BoxGeometry(lw, lh - top, rim), [endg, endg, endg, endg, inner, plain], 0, (lh - top) / 2, rim / 2, lid);
    mesh(new T.BoxGeometry(rim, lh - top, ld - 2 * rim), [plain, inner, endg, endg, inner, inner], lw / 2 - rim / 2, (lh - top) / 2, ld / 2, lid);
    mesh(new T.BoxGeometry(rim, lh - top, ld - 2 * rim), [inner, plain, endg, endg, inner, inner], -lw / 2 + rim / 2, (lh - top) / 2, ld / 2, lid);
    lidMat = wood(null, null, { bumpScale: 2.2 });
    var face = mesh(new T.PlaneGeometry(lw - 2 * rim, ld - 2 * rim), lidMat, 0, lh - top - 0.0015, ld / 2, lid);
    face.rotation.x = Math.PI / 2;
    lid.rotation.x = 0;
  }

  var woodMats = null;
  function setMap(m, map, bump) {
    if (m.map) m.map.dispose();
    if (m.bumpMap) m.bumpMap.dispose();
    m.map = map; m.bumpMap = bump || null; m.needsUpdate = true;
  }
  /** 按当前 WOOD 重画整只盒子的木纹与雕花 */
  function paintBoxWood() {
    var w = woodMats;
    setMap(w.plain, woodTexture(512, 256, { base: WOOD.plain, seed: 2 }));
    setMap(w.inner, woodTexture(512, 256, { base: WOOD.inner, seed: 4 }));
    setMap(w.endg, woodTexture(256, 128, { base: WOOD.endg, seed: 9, fine: 1.6, wave: 3 }));
    var fp = panel('front', D.bw, w.wallH, 31), bp = panel('back', D.bw, w.wallH, 37), sp = panel('side', D.bd - 2 * D.t, w.wallH, 41);
    var lp = panel('back', w.lw, w.ld, 51);
    setMap(w.front, fp.map, fp.bump); setMap(w.back, bp.map, bp.bump); setMap(w.side, sp.map, sp.bump);
    setMap(w.lidTop, lp.map, lp.bump);
  }

  function gearGeometry(rOut, rIn, teeth, depth) {
    var s = new T.Shape();
    for (var i = 0; i < teeth; i++) {
      var a0 = i / teeth * Math.PI * 2, a1 = (i + 0.25) / teeth * Math.PI * 2, a2 = (i + 0.5) / teeth * Math.PI * 2, a3 = (i + 0.75) / teeth * Math.PI * 2;
      var pts = [[rIn, a0], [rOut, a1], [rOut, a2], [rIn, a3]];
      pts.forEach(function (p, k) {
        var x = Math.cos(p[1]) * p[0], y = Math.sin(p[1]) * p[0];
        if (i === 0 && k === 0) s.moveTo(x, y); else s.lineTo(x, y);
      });
    }
    s.closePath();
    [0, 1, 2, 3, 4].forEach(function (k) {
      var h = new T.Path(), a = k / 5 * Math.PI * 2, cx = Math.cos(a) * rIn * 0.58, cy = Math.sin(a) * rIn * 0.58;
      h.absarc(cx, cy, rIn * 0.2, 0, Math.PI * 2, true);
      s.holes.push(h);
    });
    var g = new T.ExtrudeGeometry(s, { depth: depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    return g;
  }

  // ---------- 纸带路径 ----------
  function buildPath() {
    var Y = D.base + D.tapeY, ty = D.table;
    var hw = D.bw / 2;
    var pts = [
      [-4.2, ty, 26], [-3.4, ty, 15], [-2.9, ty, 9.5], [-2.85, ty, 6.2], [-3.15, ty, 4.3], [-3.55, ty, 3.0],
      [-3.75, ty, 2.1], [-3.65, ty, 1.35], [-3.3, ty, 0.72], [-2.85, ty, 0.33], [-2.25, ty + 0.002, 0.1], [-1.86, 0.06, 0.03], [-1.56, 0.205, 0.0], [-hw - 0.12, Y - 0.006, 0], [-hw + 0.05, Y, 0],
      [0, Y, 0], [hw - 0.05, Y, 0],
      [hw + 0.12, Y - 0.006, 0], [1.56, 0.205, 0], [1.86, 0.06, -0.02], [2.25, ty + 0.002, -0.06], [2.9, ty, -0.12],
      [3.35, ty, -0.32], [3.7, ty, -0.85], [3.85, ty, -1.55], [3.75, ty, -2.4], [3.45, ty, -3.4], [3.0, ty, -4.8],
      [2.5, ty, -7], [2.0, ty, -10.5], [1.6, ty, -16], [1.3, ty, -27]
    ].map(function (p) { return new T.Vector3(p[0], p[1], p[2]); });
    var curve = new T.CatmullRomCurve3(pts, false, 'centripetal');
    var N = 9000, P = new Float32Array((N + 1) * 3), S = new Float32Array(N + 1);
    var prev = null, acc = 0, combIdx = 0, v = new T.Vector3();
    for (var i = 0; i <= N; i++) {
      curve.getPoint(i / N, v);
      if (v.y < ty) v.y = ty;
      if (Math.abs(v.x) < hw + 0.02) v.y = Y; // 盒子里是平的
      if (prev) acc += v.distanceTo(prev);
      P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
      S[i] = acc;
      if (prev && prev.x < D.combX && v.x >= D.combX) combIdx = i;
      prev = (prev || new T.Vector3()).copy(v);
    }
    var off = S[combIdx];
    for (i = 0; i <= N; i++) S[i] -= off;
    path = { P: P, S: S, N: N, Y: Y };
  }

  var _p = new T.Vector3(), _t = new T.Vector3();
  function pathAt(d, outP, outT) {
    var S = path.S, P = path.P, N = path.N;
    var lo = 0, hi = N;
    if (d <= S[0]) { lo = 0; hi = 1; }
    else if (d >= S[N]) { lo = N - 1; hi = N; }
    else {
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (S[mid] > d) hi = mid; else lo = mid; }
    }
    var seg = S[hi] - S[lo] || 1e-6, k = (d - S[lo]) / seg;
    outP.set(P[lo * 3] + (P[hi * 3] - P[lo * 3]) * k, P[lo * 3 + 1] + (P[hi * 3 + 1] - P[lo * 3 + 1]) * k, P[lo * 3 + 2] + (P[hi * 3 + 2] - P[lo * 3 + 2]) * k);
    if (outT) outT.set(P[hi * 3] - P[lo * 3], P[hi * 3 + 1] - P[lo * 3 + 1], P[hi * 3 + 2] - P[lo * 3 + 2]).normalize();
  }

  var UP = new T.Vector3(0, 1, 0), _w = new T.Vector3();
  /** 纸带上一点（s：离前端的距离，v：0 = 低音边，1 = 高音边）在世界里的位置 */
  function tapePoint(s, v, time, out) {
    var L = state.tapeLen, d = state.head + s;
    pathAt(d, _p, _t);
    _w.crossVectors(_t, UP);
    if (_w.lengthSq() < 1e-6) _w.set(0, 0, 1);
    _w.normalize();
    var off = D.tapeW / 2 - v * D.tapeW;
    out.copy(_p).addScaledVector(_w, off);
    var Y = path.Y, ty = D.table;
    var inBox = Math.abs(_p.x) < D.bw / 2 + 0.01 && _p.y > Y - 0.01;
    var onTable = _p.y < ty + 0.004 ? 1 : 0;
    var y = out.y;
    if (inBox) {
      y += 0.005 * Math.exp(-Math.pow((_p.x - D.combX) / 0.06, 2));
    } else {
      var droop = Math.sin(Math.PI * clamp((_p.y - ty) / (Y - ty), 0, 1));
      y += droop * 0.012 * Math.sin(time * 1.15 + d * 1.6) + droop * 0.02 * (1 - Math.pow(2 * v - 1, 2)) * 0.4;
      var tableK = smooth(ty + 0.03, ty, _p.y);
      y += tableK * (0.007 * (1 - Math.pow(2 * v - 1, 2)) + 0.006 * (0.5 + 0.5 * Math.sin(s * 2.3 + 1.1)) * (0.6 + 0.4 * Math.sin(s * 0.7)));
      if (s < 0.32) y += tableK * Math.pow(1 - s / 0.32, 2) * 0.05;
      if (L - s < 0.4) y += tableK * Math.pow((s - (L - 0.4)) / 0.4, 2) * 0.07;
      if (onTable && y < ty - 0.002) y = ty - 0.002;
    }
    out.y = y;
    return out;
  }

  function buildTape(box) {
    var L = MB.layout(box);
    state.layout = L;
    state.tapeLen = L.total * D.cw;
    var tc = tapeCanvas(box, L);
    state.tapeArt = tc;
    if (tapeMesh) {
      scene.remove(tapeMesh); tapeGeo.dispose(); tapeMat.map.dispose(); tapeMat.dispose(); tapeDepth.dispose();
    }
    var nx = Math.ceil(state.tapeLen / 0.022), ny = 8;
    tapeGeo = new T.PlaneGeometry(1, 1, nx, ny);
    // 重排 uv：u 沿长度，v 跨宽度。第 j 排顶点放在 v = j/ny（0 = 低音边，靠近观众），
    // 贴图 v = 0 是画布底边（低音行），两者必须同向，否则谱号和孔都会上下颠倒
    var uv = tapeGeo.attributes.uv;
    for (var j = 0; j <= ny; j++) for (var i = 0; i <= nx; i++) {
      var idx = j * (nx + 1) + i;
      uv.setXY(idx, i / nx, j / ny);
    }
    tapeGeo.userData = { nx: nx, ny: ny };
    var map = tex(tc.canvas);
    map.generateMipmaps = true;
    tapeMat = new T.MeshStandardMaterial({ map: map, alphaTest: 0.5, side: T.DoubleSide, roughness: 0.88, metalness: 0 });
    tapeDepth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: map, alphaTest: 0.5 });
    tapeMesh = new T.Mesh(tapeGeo, tapeMat);
    tapeMesh.customDepthMaterial = tapeDepth;
    // 双面薄纸接收阴影会自己挡自己（整条发黑），所以只投影、不接收
    tapeMesh.castShadow = true; tapeMesh.receiveShadow = false;
    tapeMesh.frustumCulled = false;
    scene.add(tapeMesh);
    updateTape(0);
  }

  var _q = new T.Vector3();
  function updateTape(time) {
    if (!tapeGeo) return;
    var pos = tapeGeo.attributes.position, nx = tapeGeo.userData.nx, ny = tapeGeo.userData.ny, L = state.tapeLen;
    for (var j = 0; j <= ny; j++) {
      var v = j / ny;
      for (var i = 0; i <= nx; i++) {
        tapePoint(i / nx * L, v, time, _q);
        pos.setXYZ(j * (nx + 1) + i, _q.x, _q.y, _q.z);
      }
    }
    pos.needsUpdate = true;
    tapeGeo.computeVertexNormals();
  }

  // ---------- 信封 ----------
  function buildEnvelope(box) {
    if (envGroup) { scene.remove(envGroup); }
    var t = envelopeTextures(box);
    envGroup = new T.Group();
    envGroup.position.set(0.15, 0, 0.62);
    envGroup.rotation.y = -0.07;
    scene.add(envGroup);
    var W = 4.2, H = 2.6;
    function flat(geo, map, y, x, z, rot) {
      var m = new T.Mesh(geo, new T.MeshStandardMaterial({ map: map, roughness: 0.95, metalness: 0, side: T.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      if (rot) m.rotation.z = rot;
      m.position.set(x || 0, y, z || 0);
      m.receiveShadow = true;
      envGroup.add(m);
      return m;
    }
    // 底层、信纸、口袋（V 形缺口朝前）
    flat(new T.PlaneGeometry(W, H), t.env, 0.002);
    var lm = flat(new T.PlaneGeometry(2.7, 1.9), t.letter, 0.0035, -0.55, 0.95, 0.16);
    lm.material.color.setRGB(0.82, 0.8, 0.76);
    // 平面放平后：局部 +y = 世界后方（-z），所以 V 形缺口画在 -y（前边）
    var pocket = new T.Shape();
    pocket.moveTo(-W / 2, -H / 2); pocket.lineTo(0, H / 2 - H * 0.46); pocket.lineTo(W / 2, -H / 2);
    pocket.lineTo(W / 2, H / 2); pocket.lineTo(-W / 2, H / 2); pocket.closePath();
    var pg = new T.ShapeGeometry(pocket);
    var p = pg.attributes.position, uv = pg.attributes.uv;
    for (var i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / W + 0.5, p.getY(i) / H + 0.5);
    flat(pg, t.env, 0.005);
    // 封舌：打开平摊在前面（局部 -y = 世界前方）
    var fs = new T.Shape();
    fs.moveTo(-W / 2, 0); fs.lineTo(W / 2, 0); fs.lineTo(0, -1.15); fs.closePath();
    var fg = new T.ShapeGeometry(fs);
    var fp = fg.attributes.position, fu = fg.attributes.uv;
    for (i = 0; i < fp.count; i++) fu.setXY(i, fp.getX(i) / W + 0.5, 1 + fp.getY(i) / 1.15 * 0.94);
    flat(fg, t.flap, 0.0015, 0, H / 2);
    envMeshes = t;
  }

  // ---------- 外部接口 ----------
  function setBox(box) {
    state.box = box;
    var base = MB.colorOf('wood', box.wood).base;
    if (base !== WOOD.base) { WOOD = woodSet(base); paintBoxWood(); }
    buildTape(box);
    buildEnvelope(box);
    var lt = lidTextures(box);
    if (lidMat.map) lidMat.map.dispose();
    lidMat.map = lt.map; lidMat.bumpMap = lt.bump; lidMat.needsUpdate = true;
    // 待机先把有音孔的一段展示在盒内；播放时倒回起点，不跳过音符。
    state.mode = 'rest'; state.head = Math.max(endHead(), -1.9);
    return lt.ready;
  }

  function openLid() { state.lidAnim = { t: 0, from: lid.rotation.x, to: -D.lidOpen, dur: 2.2 }; }

  var play = null;
  function now() { return MBAudio.ready() ? MBAudio.now() : performance.now() / 1000; }

  function endHead() { return D.rest - state.layout.dashU * D.cw; }

  /**
   * 播放：rest（待机展示）/ done（播完了）先倒带回起点从头播；
   * paused（停在半路）从当前位置接着走。
   */
  function start(onEnd) {
    var box = state.box, L = state.layout;
    MBAudio.ensure();
    var v = D.cw / L.colSeconds;
    var rewind = state.mode === 'rest' || state.mode === 'done' || state.head < endHead() + 1e-4;
    var from = rewind ? D.rest : state.head;
    var lead = rewind ? 1.1 : 0;
    var t0 = now() + 0.12 + lead;
    var bus = MBAudio.startBus();
    var events = [];
    box.melody.forEach(function (c) {
      var d = from + L.colU(c.x) * D.cw;   // 这一列离读孔线还有多远
      if (d < -1e-4) return;               // 暂停前已经响过了
      var t = t0 + d / v;
      if (bus) MBAudio.chord(c.rows.map(MB.freqOf), t, bus);
      events.push({ t: t, rows: c.rows });
    });
    play = {
      t0: t0, v: v, from: from, events: events, ei: 0, onEnd: onEnd,
      tEnd: t0 + (from + L.dashU * D.cw) / v,
      rewindFrom: state.head, rewindStart: now(), lead: lead
    };
    state.mode = 'play';
  }

  /** 暂停：停在当前位置，下次接着播 */
  function pause() {
    if (state.mode !== 'play') return;
    MBAudio.stopBus(0.25);
    if (play && now() < play.t0) state.head = D.rest; // 还在倒带，就当已经回到起点
    state.mode = state.head <= D.rest - 1e-4 ? 'paused' : 'rest';
    play = null;
  }

  function finish() {
    state.mode = 'done';
    state.head = endHead();
    MBAudio.sparkle();
    burst();
    var cb = play.onEnd; play = null;
    if (cb) cb(true);
  }

  var _s = new T.Vector3();
  function noteVisual(rows) {
    rows.forEach(function (r) {
      var z = D.tapeW / 2 - (D.margin + (r - 1) * D.rowH);
      _s.set(D.combX, D.base + D.tapeY + 0.03, z);
      motes.spawn(_s, {
        vel: new T.Vector3((Math.random() - 0.5) * 0.06, 0.28 + Math.random() * 0.12, (Math.random() - 0.5) * 0.06),
        life: 1.7, size: 0.07, color: 0xffe2a8, peak: 0.9
      });
    });
  }

  function burst() {
    var box = state.box, L = state.layout, time = clock.elapsedTime;
    box.stamp.forEach(function (d, i) {
      var s = (L.stampU + d.x - 1) * D.cw;
      var v = (D.margin + (d.y - 1) * D.rowH) / D.tapeW;
      tapePoint(s, v, time, _s);
      _s.y += 0.006;
      var delay = d.x * 0.03 + Math.random() * 0.05;
      glows.spawn(_s, { life: 2.8, size: 0.09, color: 0xffd99a, delay: delay, peak: 0.85 });
      if (i % 2 === 0 || box.stamp.length < 40) {
        var a = Math.random() * Math.PI * 2;
        sparks.spawn(_s, {
          vel: new T.Vector3(Math.cos(a) * 0.25, 0.35 + Math.random() * 0.45, Math.sin(a) * 0.25),
          life: 1.3 + Math.random() * 0.8, size: 0.09 + Math.random() * 0.08, color: 0xfff1d0, delay: delay, spin: (Math.random() - 0.5) * 3, grow: -0.4
        });
      }
    });
    if (!box.stamp.length) {
      // 没打图形戳，也在虚线孔上闪一下
      for (var k = 0; k < 14; k++) {
        tapePoint(L.dashU * D.cw, k / 13, time, _s);
        sparks.spawn(_s, { vel: new T.Vector3(0, 0.4, 0), life: 1.4, size: 0.08, color: 0xfff1d0, delay: k * 0.03 });
      }
    }
  }

  /**
   * 拍一张“播到虚线孔”的照片：盖子全开、纸带停在终点、图形戳亮着。
   * 临时改渲染尺寸画一帧，复制到 2D 画布后立刻恢复，不影响页面上的播放状态。
   */
  var glowTexture = null;
  function snapshot(w, h) {
    var keep = {
      head: state.head, lid: lid.rotation.x, size: renderer.getSize(new T.Vector2()), pr: renderer.getPixelRatio(),
      view: { theta: view.theta, phi: view.phi, r: view.r, oy: view.offsetY }, fov: camera.fov, aspect: camera.aspect
    };
    var time = clock.elapsedTime;
    state.head = endHead();
    lid.rotation.x = -D.lidOpen;
    updateTape(time);

    // 图形戳的孔亮起来
    glowTexture = glowTexture || glowTex();
    var temp = [], box = state.box, L = state.layout;
    var pts = box.stamp.length ? box.stamp.map(function (d) {
      return [(L.stampU + d.x - 1) * D.cw, (D.margin + (d.y - 1) * D.rowH) / D.tapeW, 0.08];
    }) : Array.from({ length: 14 }, function (_, k) { return [L.dashU * D.cw, k / 13, 0.06]; });
    pts.forEach(function (p, i) {
      var m = new T.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, blending: T.AdditiveBlending, color: 0xffd99a, opacity: 0.85 });
      var s = new T.Sprite(m);
      tapePoint(p[0], p[1], time, s.position);
      s.position.y += 0.008;
      var sz = p[2] * (i % 5 === 0 ? 1.8 : 1);
      s.scale.set(sz, sz, 1);
      scene.add(s); temp.push(s);
    });
    var hidden = [motes, sparks, glows].map(function (pool) {
      return pool.items.map(function (it) { var v = it.s.visible; it.s.visible = false; return v; });
    });

    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = 32;
    view.theta = 0.06; view.phi = 0.62; view.offsetY = 0;
    var tanH = Math.tan(camera.fov * Math.PI / 360) * camera.aspect;
    view.r = Math.max(3.5 / tanH, 1.7 / Math.tan(camera.fov * Math.PI / 360));
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    placeCamera();
    renderer.render(scene, camera);
    var out = canvas(w, h);
    out.getContext('2d').drawImage(renderer.domElement, 0, 0, w, h);

    // 恢复
    temp.forEach(function (s) { scene.remove(s); s.material.dispose(); });
    [motes, sparks, glows].forEach(function (pool, k) { pool.items.forEach(function (it, i) { it.s.visible = hidden[k][i]; }); });
    state.head = keep.head; lid.rotation.x = keep.lid;
    view.theta = keep.view.theta; view.phi = keep.view.phi; view.r = keep.view.r; view.offsetY = keep.view.oy;
    renderer.setPixelRatio(keep.pr);
    resize();
    updateTape(time);
    placeCamera();
    renderer.render(scene, camera);
    return out;
  }

  function frame() {
    var dt = Math.min(0.05, clock.getDelta()), time = clock.elapsedTime;
    if (state.lidAnim) {
      var la = state.lidAnim; la.t += dt;
      var k = clamp(la.t / la.dur, 0, 1);
      var e = 1 - Math.pow(1 - k, 3);
      lid.rotation.x = la.from + (la.to - la.from) * e + Math.sin(k * Math.PI) * 0.0;
      if (k >= 1) state.lidAnim = null;
    }
    var prevHead = state.head;
    if (state.mode === 'play' && play) {
      var t = now();
      if (t < play.t0) {
        // 先把纸带倒回起点
        var rk = play.lead ? clamp((t - play.rewindStart) / play.lead, 0, 1) : 1;
        state.head = play.rewindFrom + (play.from - play.rewindFrom) * easeInOut(rk);
      } else {
        state.head = play.from - (t - play.t0) * play.v;
        while (play.ei < play.events.length && play.events[play.ei].t <= t) { noteVisual(play.events[play.ei].rows); play.ei++; }
        if (t >= play.tEnd) finish();
      }
    }
    var moved = prevHead - state.head;
    if (roller) {
      roller.rotation.y += moved / 0.045;
      starAxle.rotation.z -= moved / 0.03;
      gear.rotation.z += moved / 0.045;
      crank.rotation.x += moved / 0.09;
    }
    updateTape(time);
    updateDust(time);
    motes.update(dt); sparks.update(dt); glows.update(dt);
    placeCamera();
    renderer.render(scene, camera);
  }

  // ---------- 视角 ----------
  // 页面上下各有一条界面：顶部标题、底部按钮。八音盒要放进中间那段，并且整体偏下一点
  var UI_TOP = 104, UI_BOTTOM = 104;
  function resize() {
    var w = root.innerWidth, h = root.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 40 : 32;
    var tanV = Math.tan(camera.fov * Math.PI / 360), tanH = tanV * camera.aspect;
    // 以盒子本体取景，纸带可以延伸到画面外；保留标题和操作区。
    var band = clamp((h - UI_TOP - UI_BOTTOM) / h, 0.45, 0.9);
    var rV = 1.65 / (tanV * band);
    // 横屏多露一点两边的纸带，竖屏只要盒子装得下
    var rH = (w / h < 0.8 ? 1.75 : 2.05) / tanH;
    view.baseR = Math.max(rV, rH);
    if (!view.touched) view.r = view.baseR;
    view.minR = view.baseR * 0.5; view.maxR = view.baseR * 1.5;
    view.r = clamp(view.r, view.minR, view.maxR);
    // 画面中心挪到两条界面中间，再往下一点
    view.offsetY = -((UI_TOP - UI_BOTTOM) / 2 + h * 0.09);
    camera.setViewOffset(w, h, 0, view.offsetY, w, h);
    camera.updateProjectionMatrix();
  }

  function placeCamera() {
    var c = Math.cos(view.phi);
    camera.position.set(
      view.target.x + view.r * c * Math.sin(view.theta),
      view.target.y + view.r * Math.sin(view.phi),
      view.target.z + view.r * c * Math.cos(view.theta)
    );
    camera.lookAt(view.target);
  }

  function controls(cv) {
    var pts = {}, last = null, pinch = 0;
    cv.addEventListener('pointerdown', function (e) {
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', function (e) {
      if (!pts[e.pointerId]) return;
      var ids = Object.keys(pts);
      var p = pts[e.pointerId];
      if (ids.length === 1) {
        view.theta = clamp(view.theta - (e.clientX - p.x) * 0.005, -0.75, 0.75);
        view.phi = clamp(view.phi + (e.clientY - p.y) * 0.004, 0.22, 1.2);
        view.touched = true;
      }
      p.x = e.clientX; p.y = e.clientY;
      if (ids.length === 2) {
        var a = pts[ids[0]], b = pts[ids[1]];
        var dd = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) { view.r = clamp(view.r * pinch / dd, view.minR, view.maxR); view.touched = true; }
        pinch = dd;
      }
    });
    function up(e) { delete pts[e.pointerId]; pinch = 0; }
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      view.r = clamp(view.r * (1 + e.deltaY * 0.001), view.minR, view.maxR);
      view.touched = true;
    }, { passive: false });
    void last;
  }

  root.MBScene = {
    init: init, setBox: setBox, openLid: openLid, play: start, pause: pause, snapshot: snapshot,
    stop: pause,
    isPlaying: function () { return state.mode === 'play'; },
    mode: function () { return state.mode; },
    D: D
  };
})(window);
