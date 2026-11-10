/*
 * 记谱小工具：高音谱号路径、把纸带上的一句旋律画成五线谱 SVG、把图形戳画成点阵 SVG。
 * 贺卡和八音盒盖子上的阴刻都用它。
 *
 * 五线谱坐标：五条线在 y = 30, 38, 46, 54, 62（从上到下），线距 8，半线距 4。
 * 第二线（y=54）是 G4，高音谱号的旋涡就绕着它。
 */
(function (root) {
  'use strict';

  // 高音谱号的中心线（描边画，圆头），配合 CLEF_BALL 的小圆点
  var CLEF_PATH = 'M16.5 51 C12.5 50.5 12 56.5 16 57.5 C21 58.8 24.5 53.5 21.5 49 C18 44 9 45.5 8 53 ' +
    'C7 61 13.5 66 20 65.2 C27 64.2 30 56 26.5 49.5 C23 43.5 13 40 12.5 30 C12 20 17 12 19.5 4.5 ' +
    'C22 9 23.5 16 19 23 C15 29 16 40 17 52 L19 72 C19.6 77 15 80 11.5 78';
  var CLEF_BALL = { cx: 11.6, cy: 75.4, r: 2.7 };

  var TOP = 30, BOTTOM = 62, HALF = 4;
  function stepY(row) { return BOTTOM - (row - 1 - 2) * HALF; } // row 1 = C4 = step 0；E4（step 2）在第一线

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  /** 选出“一句”：从第一个音所在小节开始，最多 4 小节 */
  function phraseOf(box) {
    var cpb = box.colsPerBar, mel = box.melody;
    if (!mel.length) return { start: 1, end: 1 + cpb, notes: [] };
    var first = mel[0].x;
    var start = 1 + Math.floor((first - 1) / cpb) * cpb;
    var end = start + cpb * 4;
    var last = mel[mel.length - 1].x;
    var lastBarEnd = 1 + (Math.floor((last - 1) / cpb) + 1) * cpb;
    end = Math.min(end, lastBarEnd);
    var notes = mel.filter(function (c) { return c.x >= start && c.x < end; });
    return { start: start, end: end, notes: notes, complete: last < end };
  }

  /** 按到下一个音的距离（列）推断时值 */
  function durationOf(gap) {
    if (gap <= 0.5) return { head: 'fill', flags: 2, dot: false, stem: true };
    if (gap <= 1) return { head: 'fill', flags: 1, dot: false, stem: true };
    if (gap <= 1.5) return { head: 'fill', flags: 1, dot: true, stem: true };
    if (gap <= 2.5) return { head: 'fill', flags: 0, dot: false, stem: true };
    if (gap <= 3.5) return { head: 'fill', flags: 0, dot: true, stem: true };
    if (gap <= 5) return { head: 'open', flags: 0, dot: false, stem: true };
    if (gap <= 7) return { head: 'open', flags: 0, dot: true, stem: true };
    return { head: 'open', flags: 0, dot: false, stem: false };
  }

  /**
   * 旋律五线谱。opts: { width, ink, line, meter:true/false, clef:true/false }
   * 返回完整的 <svg> 字符串，viewBox 高 92。
   */
  function melodySVG(box, opts) {
    opts = opts || {};
    var W = opts.width || 600, H = 92;
    var ink = opts.ink || '#4a3628', line = opts.line || ink;
    var ph = phraseOf(box);
    var o = [];
    o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">');
    // 五线
    for (var i = 0; i < 5; i++) {
      o.push('<line x1="2" x2="' + (W - 2) + '" y1="' + (TOP + i * 8) + '" y2="' + (TOP + i * 8) + '" stroke="' + line + '" stroke-width="0.9" opacity="0.75"/>');
    }
    // 谱号
    var left = 34;
    if (opts.clef !== false) {
      o.push('<g transform="translate(2,0)" fill="none" stroke="' + ink + '" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="' + CLEF_PATH + '"/></g>');
      o.push('<circle cx="' + (CLEF_BALL.cx + 2) + '" cy="' + CLEF_BALL.cy + '" r="' + CLEF_BALL.r + '" fill="' + ink + '"/>');
    }
    // 拍号
    if (opts.meter !== false) {
      var mt = box.meter.split('/');
      o.push('<g font-family="Georgia, \'Times New Roman\', serif" font-weight="700" font-size="17" fill="' + ink + '" text-anchor="middle">' +
        '<text x="' + (left + 7) + '" y="44">' + esc(mt[0]) + '</text><text x="' + (left + 7) + '" y="60">' + esc(mt[1]) + '</text></g>');
      left += 18;
    }
    var x0 = left + 12, x1 = W - 16;
    var span = Math.max(1, ph.end - ph.start);
    function px(x) { return x0 + (x - ph.start) / span * (x1 - x0); }

    // 小节线
    for (var b = ph.start + box.colsPerBar; b < ph.end; b += box.colsPerBar) {
      var bx = px(b) - 5;
      o.push('<line x1="' + bx + '" x2="' + bx + '" y1="' + TOP + '" y2="' + BOTTOM + '" stroke="' + ink + '" stroke-width="1"/>');
    }
    if (ph.complete) {
      o.push('<line x1="' + (W - 8) + '" x2="' + (W - 8) + '" y1="' + TOP + '" y2="' + BOTTOM + '" stroke="' + ink + '" stroke-width="1"/>');
      o.push('<line x1="' + (W - 4) + '" x2="' + (W - 4) + '" y1="' + TOP + '" y2="' + BOTTOM + '" stroke="' + ink + '" stroke-width="3"/>');
    } else {
      o.push('<line x1="' + (W - 4) + '" x2="' + (W - 4) + '" y1="' + TOP + '" y2="' + BOTTOM + '" stroke="' + ink + '" stroke-width="1"/>');
    }

    var mel = box.melody;
    ph.notes.forEach(function (c) {
      var idx = mel.indexOf(c);
      var nextX = idx + 1 < mel.length ? mel[idx + 1].x : ph.end;
      var gap = Math.min(nextX, ph.end) - c.x;
      // 跨小节的长音，就按到小节线为止画
      var barEnd = ph.start + (Math.floor((c.x - ph.start) / box.colsPerBar) + 1) * box.colsPerBar;
      gap = Math.max(0.5, Math.min(gap, barEnd - c.x));
      var d = durationOf(gap);
      var cx = px(c.x);
      var rows = c.rows.slice().sort(function (a, b2) { return a - b2; });
      var ys = rows.map(stepY);
      var lowY = ys[0], highY = ys[ys.length - 1];
      var avgStep = rows.reduce(function (s, r) { return s + r - 1; }, 0) / rows.length;
      var up = avgStep < 6;

      // 加线
      var ledgers = {};
      rows.forEach(function (r) {
        var st = r - 1, k;
        if (st <= 0) for (k = 0; k >= st; k -= 2) ledgers[k] = 1;
        if (st >= 12) for (k = 12; k <= st; k += 2) ledgers[k] = 1;
      });
      Object.keys(ledgers).forEach(function (k) {
        var ly = BOTTOM - (Number(k) - 2) * HALF;
        o.push('<line x1="' + (cx - 8.5) + '" x2="' + (cx + 8.5) + '" y1="' + ly + '" y2="' + ly + '" stroke="' + ink + '" stroke-width="1"/>');
      });

      // 符头（二度相邻时错开）
      var shifted = false;
      rows.forEach(function (r, i) {
        var hx = cx;
        if (i > 0 && r - rows[i - 1] === 1 && !shifted) { hx = cx + (up ? 9.4 : -9.4); shifted = true; }
        else shifted = false;
        var hy = stepY(r);
        var tr = ' transform="rotate(-22 ' + hx + ' ' + hy + ')"';
        if (d.head === 'fill') o.push('<ellipse cx="' + hx + '" cy="' + hy + '" rx="5" ry="3.6" fill="' + ink + '"' + tr + '/>');
        else o.push('<ellipse cx="' + hx + '" cy="' + hy + '" rx="4.6" ry="3.2" fill="none" stroke="' + ink + '" stroke-width="1.6"' + tr + '/>');
        if (d.dot) {
          var dy = (r - 1) % 2 === 0 ? hy - 4 : hy; // 偶数级在线上，附点挪到上面的间里
          o.push('<circle cx="' + (cx + 10.5) + '" cy="' + dy + '" r="1.7" fill="' + ink + '"/>');
        }
      });

      // 符干与符尾
      if (d.stem) {
        var sx = up ? cx + 4.5 : cx - 4.5;
        var tip = up ? highY - 27 : lowY + 27;
        var base = up ? lowY - 0.5 : highY + 0.5;
        o.push('<line x1="' + sx + '" x2="' + sx + '" y1="' + base + '" y2="' + tip + '" stroke="' + ink + '" stroke-width="1.3"/>');
        for (var f = 0; f < d.flags; f++) {
          var fy = up ? tip + f * 6 : tip - f * 6;
          var s = up ? 1 : -1;
          o.push('<path d="M' + sx + ' ' + fy + ' c0 ' + (s * 6) + ' 8.5 ' + (s * 8) + ' 7 ' + (s * 17) +
            ' c1 ' + (-s * 6) + ' -3 ' + (-s * 10) + ' -7 ' + (-s * 11) + 'z" fill="' + ink + '"/>');
        }
      }
    });
    o.push('</svg>');
    return o.join('');
  }

  /** 图形戳点阵。opts: { width, height, ink, glow } */
  function stampSVG(box, opts) {
    opts = opts || {};
    var W = opts.width || 600, H = opts.height || 78;
    var ink = opts.ink || '#4a3628', glow = opts.glow || '#c9a35a';
    var maxX = 1, minX = 99;
    box.stamp.forEach(function (d) { maxX = Math.max(maxX, d.x); minX = Math.min(minX, d.x); });
    var cell = Math.min((H - 8) / 15, (W - 20) / Math.max(1, maxX - minX + 1));
    var gw = (maxX - minX) * cell;
    var ox = (W - gw) / 2, oy = 4 + cell / 2;
    var o = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">'];
    box.stamp.forEach(function (d) {
      var x = ox + (d.x - minX) * cell, y = oy + (15 - d.y) * cell;
      o.push('<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (cell * 0.52).toFixed(2) + '" fill="' + glow + '" opacity="0.35"/>');
      o.push('<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (cell * 0.3).toFixed(2) + '" fill="' + ink + '"/>');
    });
    o.push('</svg>');
    return o.join('');
  }

  /**
   * 把上面生成的这类简单 SVG（g/line/ellipse/circle/path/text）直接画到 canvas 上。
   * 不走 <img>，所以导出图片时画布不会被浏览器判定为“被污染”。
   * opts.color：把所有颜色统一换成这一种（阴刻凹凸图用黑色）。
   */
  function drawSVG(g, svg, x, y, w, h, opts) {
    opts = opts || {};
    var doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    var root = doc.documentElement;
    var vb = (root.getAttribute('viewBox') || '0 0 100 100').split(/[\s,]+/).map(Number);
    g.save();
    g.translate(x, y);
    g.scale(w / vb[2], h / vb[3]);
    g.translate(-vb[0], -vb[1]);
    walk(root, { fill: 'black', stroke: 'none', sw: 1, op: 1, font: null, anchor: 'start', cap: 'butt', join: 'miter' });
    g.restore();

    function num(el, k, d) { var v = el.getAttribute(k); return v == null ? d : Number(v); }
    function applyTransform(t) {
      var re = /(translate|rotate|scale)\(([^)]*)\)/g, m;
      while ((m = re.exec(t))) {
        var a = m[2].split(/[\s,]+/).filter(Boolean).map(Number);
        if (m[1] === 'translate') g.translate(a[0], a[1] || 0);
        else if (m[1] === 'scale') g.scale(a[0], a.length > 1 ? a[1] : a[0]);
        else {
          var r = a[0] * Math.PI / 180;
          if (a.length > 2) { g.translate(a[1], a[2]); g.rotate(r); g.translate(-a[1], -a[2]); } else g.rotate(r);
        }
      }
    }
    function paint(st, shape) {
      g.globalAlpha = st.op;
      if (st.fill !== 'none') { g.fillStyle = opts.color || st.fill; shape(); g.fill(); }
      if (st.stroke !== 'none') {
        g.strokeStyle = opts.color || st.stroke; g.lineWidth = st.sw; g.lineCap = st.cap; g.lineJoin = st.join;
        shape(); g.stroke();
      }
    }
    function walk(el, inh) {
      var st = {
        fill: el.getAttribute('fill') || inh.fill, stroke: el.getAttribute('stroke') || inh.stroke,
        sw: num(el, 'stroke-width', inh.sw), op: inh.op * num(el, 'opacity', 1),
        cap: el.getAttribute('stroke-linecap') || inh.cap, join: el.getAttribute('stroke-linejoin') || inh.join,
        anchor: el.getAttribute('text-anchor') || inh.anchor,
        font: el.getAttribute('font-size') ? (el.getAttribute('font-weight') || '400') + ' ' + el.getAttribute('font-size') + 'px ' +
          (el.getAttribute('font-family') || 'serif') : inh.font
      };
      g.save();
      if (el.getAttribute('transform')) applyTransform(el.getAttribute('transform'));
      var tag = el.tagName.toLowerCase();
      if (tag === 'line') {
        paint(Object.assign({}, st, { fill: 'none' }), function () {
          g.beginPath(); g.moveTo(num(el, 'x1', 0), num(el, 'y1', 0)); g.lineTo(num(el, 'x2', 0), num(el, 'y2', 0));
        });
      } else if (tag === 'circle') {
        paint(st, function () { g.beginPath(); g.arc(num(el, 'cx', 0), num(el, 'cy', 0), num(el, 'r', 0), 0, Math.PI * 2); });
      } else if (tag === 'ellipse') {
        paint(st, function () { g.beginPath(); g.ellipse(num(el, 'cx', 0), num(el, 'cy', 0), num(el, 'rx', 0), num(el, 'ry', 0), 0, 0, Math.PI * 2); });
      } else if (tag === 'path') {
        var p = new Path2D(el.getAttribute('d') || '');
        g.globalAlpha = st.op;
        if (st.fill !== 'none') { g.fillStyle = opts.color || st.fill; g.fill(p); }
        if (st.stroke !== 'none') { g.strokeStyle = opts.color || st.stroke; g.lineWidth = st.sw; g.lineCap = st.cap; g.lineJoin = st.join; g.stroke(p); }
      } else if (tag === 'text') {
        g.globalAlpha = st.op;
        g.font = st.font || '16px serif';
        g.textAlign = st.anchor === 'middle' ? 'center' : st.anchor === 'end' ? 'right' : 'left';
        g.textBaseline = 'alphabetic';
        g.fillStyle = opts.color || (st.fill === 'none' ? 'black' : st.fill);
        g.fillText(el.textContent, num(el, 'x', 0), num(el, 'y', 0));
      }
      for (var i = 0; i < el.children.length; i++) walk(el.children[i], st);
      g.restore();
    }
  }

  // 卷草角花（和 index.html 里的 #scroll 同一套路径），给导出的卡片用
  var SCROLL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<g fill="none" stroke="#7a5a3e" stroke-width="1.4" stroke-linecap="round">' +
    '<path d="M10 72 C10 37 37 10 72 10"/><path d="M72 10 C84 10 92 17 90 26 C88 34 78 34 76 27 C74 22 79 19 82 22"/>' +
    '<path d="M10 72 C10 84 17 92 26 90 C34 88 34 78 27 76 C22 74 19 79 22 82"/>' +
    '<path d="M17 17 C23 12 31 15 30 22 C29 26 24 26 24 22"/><path d="M4 4 L13 13" stroke-width="1"/></g>' +
    '<g fill="#7a5a3e" opacity=".85"><path d="M30 27 C36 18 47 15 53 18 C46 22 38 27 30 27Z"/>' +
    '<path d="M27 30 C18 36 15 47 18 53 C22 46 27 38 27 30Z"/><path d="M50 14 C56 9 63 9 66 12 C61 14 56 15 50 14Z"/>' +
    '<path d="M14 50 C9 56 9 63 12 66 C14 61 15 56 14 50Z"/><circle cx="5" cy="5" r="2.2"/>' +
    '<circle cx="40" cy="20" r="1.4"/><circle cx="20" cy="40" r="1.4"/></g></svg>';
  var FLOURISH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 18">' +
    '<g fill="none" stroke="#7a5a3e" stroke-width="1.2" stroke-linecap="round">' +
    '<path d="M14 9 C46 1 78 17 108 9 M132 9 C162 1 194 17 226 9"/><path d="M108 9 C112 3 118 3 120 9 C122 15 128 15 132 9"/>' +
    '<path d="M14 9 C10 7 8 11 11 12 M226 9 C230 7 232 11 229 12"/></g><circle cx="120" cy="9" r="1.8" fill="#7a5a3e"/></svg>';

  root.MBNote = {
    CLEF_PATH: CLEF_PATH, CLEF_BALL: CLEF_BALL, SCROLL_SVG: SCROLL_SVG, FLOURISH_SVG: FLOURISH_SVG,
    phraseOf: phraseOf, melodySVG: melodySVG, stampSVG: stampSVG, drawSVG: drawSVG, esc: esc
  };
})(window);
