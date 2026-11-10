/*
 * 保存图片：两张纪念图
 *   1. 八音盒照片：纸带停在虚线孔、图形戳亮着的那一刻，外面套一圈相纸白边和 To / From
 *   2. 寄语卡片：和页面上的卡片同一套版式
 * 预览浮层里两张错位叠放，左右按钮 / 滑动循环切换，「保存这张」只保存当前那张。
 */
(function () {
  'use strict';
  var MBNote = window.MBNote, MBScene = window.MBScene;
  var EN = '"Pinyon Script", "Snell Roundhand", cursive';
  var CN = '"LXGW WenKai", "STKaiti", "KaiTi", serif';
  var INK = '#4a3628', SOFT = '#7a604a', PAPER = '#ecdfc2';
  var W = 1000, SCALE = 2;

  function mk(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.round(w * SCALE); c.height = Math.round(h * SCALE);
    var g = c.getContext('2d');
    g.scale(SCALE, SCALE);
    return { c: c, g: g };
  }

  function paper(g, w, h) {
    g.fillStyle = PAPER; g.fillRect(0, 0, w, h);
    var glow = g.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.45, Math.max(w, h) * 0.6);
    glow.addColorStop(0, 'rgba(255,250,236,.55)'); glow.addColorStop(0.6, 'rgba(255,250,236,0)');
    glow.addColorStop(1, 'rgba(140,96,48,.28)');
    g.fillStyle = glow; g.fillRect(0, 0, w, h);
    for (var i = 0; i < w * h / 70; i++) {
      g.fillStyle = Math.random() < 0.55 ? 'rgba(120,90,50,.07)' : 'rgba(255,255,255,.12)';
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1);
    }
  }

  function frame(g, w, h, a, b) {
    g.strokeStyle = 'rgba(110,80,52,.5)'; g.lineWidth = 1.4; g.strokeRect(a, a, w - a * 2, h - a * 2);
    g.strokeStyle = 'rgba(110,80,52,.32)'; g.lineWidth = 0.8; g.strokeRect(b, b, w - b * 2, h - b * 2);
  }

  function corners(g, w, h, size, inset) {
    [[inset, inset, 1, 1], [w - inset, inset, -1, 1], [inset, h - inset, 1, -1], [w - inset, h - inset, -1, -1]].forEach(function (p) {
      g.save(); g.translate(p[0], p[1]); g.scale(p[2], p[3]);
      MBNote.drawSVG(g, MBNote.SCROLL_SVG, 0, 0, size, size);
      g.restore();
    });
  }

  // 「To 名字」：花体英文 + 中文，整体居中或靠右
  function signLine(g, label, name, x, y, align, enPx, cnPx) {
    g.textBaseline = 'alphabetic';
    g.font = enPx + 'px ' + EN; var lw = g.measureText(label).width;
    g.font = cnPx + 'px ' + CN; var nw = g.measureText(name).width;
    var gap = enPx * 0.2, total = lw + gap + nw;
    var x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    g.textAlign = 'left';
    g.fillStyle = '#5a3f2b'; g.font = enPx + 'px ' + EN; g.fillText(label, x0, y);
    g.fillStyle = INK; g.font = cnPx + 'px ' + CN; g.fillText(name, x0 + lw + gap, y);
  }

  function shrink(g, text, px, family, maxW) {
    g.font = px + 'px ' + family;
    var w = g.measureText(text).width;
    return w > maxW ? Math.max(14, Math.floor(px * maxW / w)) : px;
  }

  function wrap(g, text, maxW) {
    var out = [];
    String(text || '').split('\n').forEach(function (para) {
      var line = '';
      Array.from(para).forEach(function (ch) {
        if (g.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch;
      });
      out.push(line);
    });
    return out;
  }

  // ---------- 第一张：八音盒照片 ----------
  function makeScene(box) {
    var pw = 1600, ph = 1150;
    var shot = MBScene.snapshot(pw, ph);
    var m = 46, head = 92, foot = 128;
    var iw = W - m * 2, ih = iw * ph / pw;
    var H = m + head + ih + foot + m * 0.6;
    var o = mk(W, H), g = o.g;
    paper(g, W, H);
    frame(g, W, H, 16, 21);
    // 标题
    g.textAlign = 'center'; g.fillStyle = '#5a3f2b';
    g.font = '54px ' + EN; g.fillText('The Lullaby Machine', W / 2, m + 50);
    g.font = '15px ' + CN; g.fillStyle = SOFT;
    if ('letterSpacing' in g) g.letterSpacing = '6px';
    g.fillText('子守唄の機', W / 2 + 3, m + 78);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    // 照片
    var py = m + head;
    g.save();
    g.shadowColor = 'rgba(40,24,10,.35)'; g.shadowBlur = 18; g.shadowOffsetY = 6;
    g.fillStyle = '#05060a'; g.fillRect(m, py, iw, ih);
    g.restore();
    g.drawImage(shot, m, py, iw, ih);
    g.strokeStyle = 'rgba(60,40,24,.6)'; g.lineWidth = 1.2; g.strokeRect(m, py, iw, ih);
    // To / From
    var to = box.to || '你', from = box.from || '我';
    var ly = py + ih + 78, colW = iw / 2 - 40;
    var c1 = shrink(g, to, 34, CN, colW - 70), c2 = shrink(g, from, 34, CN, colW - 100);
    signLine(g, 'To', to, m + 6, ly, 'left', 48, c1);
    signLine(g, 'From', from, W - m - 6, ly, 'right', 48, c2);
    g.strokeStyle = 'rgba(110,80,52,.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(m, ly + 14); g.lineTo(m + colW, ly + 14); g.moveTo(W - m - colW, ly + 14); g.lineTo(W - m, ly + 14); g.stroke();
    return o.c;
  }

  // ---------- 第二张：寄语卡片 ----------
  function makeCard(box) {
    var pad = 96, cw = W - pad * 2;
    var meas = mk(1, 1).g;
    meas.font = '34px ' + CN;
    var lines = wrap(meas, box.message || '', cw - 8);
    if (!box.message) lines = [];
    var LH = 74;
    var staffH = 126, stampH = box.stamp.length ? 112 : 0;
    var H = 70 + 92 + 40 + staffH + stampH + 30 + (lines.length + 1) * LH + 40 + 90 + 70;
    H = Math.max(H, Math.round(W * 1.1));
    var o = mk(W, H), g = o.g;
    paper(g, W, H);
    frame(g, W, H, 22, 29);
    corners(g, W, H, 130, 14);

    var y = 70 + 76;
    var to = box.to || '你';
    signLine(g, 'To', to, W / 2, y, 'center', 84, shrink(g, to, 56, CN, cw - 160));
    y += 22;
    MBNote.drawSVG(g, MBNote.FLOURISH_SVG, W / 2 - 170, y, 340, 25.5);
    y += 48;
    MBNote.drawSVG(g, MBNote.melodySVG(box, { width: 600, ink: INK }), pad - 10, y, cw + 20, (cw + 20) * 92 / 600);
    y += staffH + 4;
    if (stampH) {
      var sw = cw * 0.72;
      MBNote.drawSVG(g, MBNote.stampSVG(box, { width: 420, height: 76 }), W / 2 - sw / 2, y, sw, sw * 76 / 420);
      y += stampH;
    }
    y += 24;
    // 寄语写在淡淡的五线谱上，最后多留一行空谱
    for (var i = 0; i <= lines.length; i++) {
      var top = y + i * LH, mid = top + LH / 2;
      g.strokeStyle = 'rgba(128,98,70,.26)'; g.lineWidth = 1;
      for (var k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(pad, mid + k * 9); g.lineTo(W - pad, mid + k * 9); g.stroke(); }
      if (i < lines.length) {
        g.fillStyle = '#3f2c1f'; g.font = '34px ' + CN; g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(lines[i], pad + 4, mid + 1);
        g.textBaseline = 'alphabetic';
      }
    }
    y += (lines.length + 1) * LH + 70;
    var from = box.from || '我';
    signLine(g, 'From', from, W - pad - 4, Math.max(y, H - 120), 'right', 80, shrink(g, from, 52, CN, cw - 200));
    return o.c;
  }

  function toBlob(c) {
    return new Promise(function (ok, bad) { c.toBlob(function (b) { if (b) ok(b); else bad(new Error('导出失败')); }, 'image/png'); });
  }

  function safeName(s) { return String(s || '你').replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 20) || '你'; }

  // ---------- 预览浮层 ----------
  function init(getBox) {
    var $ = function (id) { return document.getElementById(id); };
    var layer = $('posterLayer'), track = $('posterTrack');
    var imgs = [$('posterImgScene'), $('posterImgCard')];
    var cards = imgs.map(function (im) { return im.parentElement; });
    var dots = Array.prototype.slice.call($('posterDots').querySelectorAll('button'));
    var slides = [], current = 0, busy = false;

    function goTo(i, animate) {
      i = ((i % imgs.length) + imgs.length) % imgs.length;
      var old = current;
      current = i;
      cards.forEach(function (card, k) { card.classList.remove('leaving'); card.classList.toggle('is-active', k === i); });
      if (animate !== false && old !== i) { void cards[old].offsetWidth; cards[old].classList.add('leaving'); }
      dots.forEach(function (d, k) { d.classList.toggle('on', k === i); d.setAttribute('aria-pressed', String(k === i)); });
    }

    var swipeUntil = 0, touch = null;
    cards.forEach(function (card, k) {
      card.addEventListener('animationend', function () { card.classList.remove('leaving'); });
      card.addEventListener('click', function () { if (k !== current && performance.now() > swipeUntil) goTo(k); });
    });
    track.addEventListener('touchstart', function (e) {
      touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    }, { passive: true });
    track.addEventListener('touchend', function (e) {
      if (!touch) return;
      var dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
      touch = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { swipeUntil = performance.now() + 450; goTo(current + (dx < 0 ? 1 : -1)); }
    }, { passive: true });
    $('posterPrev').addEventListener('click', function () { goTo(current - 1); });
    $('posterNext').addEventListener('click', function () { goTo(current + 1); });
    dots.forEach(function (d, k) { d.addEventListener('click', function () { goTo(k); }); });

    function close() { layer.classList.remove('open'); layer.setAttribute('aria-hidden', 'true'); }
    $('posterClose').addEventListener('click', close);
    layer.addEventListener('click', function (e) { if (e.target === layer || e.target === track) close(); });
    document.addEventListener('keydown', function (e) {
      if (!layer.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') goTo(current - 1);
      if (e.key === 'ArrowRight') goTo(current + 1);
    });

    // 手机上优先走系统分享面板（可以直接存进相册），否则下载
    $('posterSave').addEventListener('click', function () {
      var s = slides[current];
      if (!s) return;
      var file = typeof File === 'function' ? new File([s.blob], s.filename, { type: 'image/png' }) : null;
      var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
      if (coarse && file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: s.filename }).catch(function (e) { if (e.name !== 'AbortError') download(s); });
        return;
      }
      download(s);
    });
    function download(s) {
      var a = document.createElement('a');
      a.href = s.url; a.download = s.filename;
      document.body.appendChild(a); a.click(); a.remove();
    }

    return function open(btn) {
      if (busy) return;
      busy = true;
      var label = btn && btn.querySelector('.cn'), old = label && label.textContent;
      if (label) label.textContent = '冲洗中…';
      var box = getBox();
      var p = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      return p.then(function () {
        var canvases = [makeScene(box), makeCard(box)];
        var names = ['八音盒-To' + safeName(box.to) + '.png', '寄语卡-To' + safeName(box.to) + '.png'];
        return Promise.all(canvases.map(toBlob)).then(function (blobs) {
          slides.forEach(function (s) { URL.revokeObjectURL(s.url); });
          slides = blobs.map(function (b, i) { return { blob: b, url: URL.createObjectURL(b), filename: names[i] }; });
          return Promise.all(slides.map(function (s, i) {
            imgs[i].src = s.url;
            return (imgs[i].decode ? imgs[i].decode() : Promise.resolve()).then(function () {
              cards[i].style.setProperty('--ratio', imgs[i].naturalWidth / imgs[i].naturalHeight);
            });
          }));
        });
      }).then(function () {
        layer.classList.add('open'); layer.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(function () { goTo(0, false); });
      }).catch(function (e) {
        console.error(e);
        alert('图片生成失败了：' + e.message);
      }).then(function () {
        if (label) label.textContent = old;
        busy = false;
      });
    };
  }

  window.MBPoster = { init: init, makeScene: makeScene, makeCard: makeCard };
})();
