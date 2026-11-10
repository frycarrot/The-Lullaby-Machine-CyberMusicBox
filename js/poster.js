/* 单张竖版信纸：To + 图形戳、旋律、八音盒照片、寄语、From。 */
(function () {
  'use strict';
  var MBNote = window.MBNote, MBScene = window.MBScene;
  var EN = '"Pinyon Script", "Snell Roundhand", cursive';
  var CN = '"LXGW WenKai", "STKaiti", "KaiTi", serif';
  var INK = '#4a3628', SOFT = '#7a604a', PAPER = '#ecdfc2';
  var W = 1000, SCALE = 2;

  function mk(w, h) {
    var c = document.createElement('canvas');
    var scale = Math.min(SCALE, 16000 / Math.max(w, h), Math.sqrt(16000000 / (w * h)));
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    var g = c.getContext('2d');
    g.scale(scale, scale);
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

  function makeLetter(box) {
    var pad = 80, cw = W - pad * 2, LH = 66;
    var meas = mk(1, 1).g;
    meas.font = '34px ' + CN;
    var lines = box.message ? wrap(meas, box.message, cw - 16) : [];
    var photoY = 350, photoH = 604;
    var messageY = photoY + photoH + 56;
    var fromY = messageY + Math.max(2, lines.length) * LH + 82;
    var H = Math.max(1600, fromY + 150);
    var o = mk(W, H), g = o.g;
    paper(g, W, H); frame(g, W, H, 22, 29); corners(g, W, H, 100, 14);
    var toWidth = box.stamp.length ? cw - 270 : cw;
    signLine(g, 'To', box.to || '你', pad, 150, 'left', 72,
      shrink(g, box.to || '你', 48, CN, toWidth - 100));
    if (box.stamp.length) {
      MBNote.drawSVG(g, MBNote.stampSVG(box, { width: 220, height: 110 }), W - pad - 220, 70, 220, 110);
    }
    MBNote.drawSVG(g, MBNote.melodySVG(box, { width: 600, ink: INK }), pad, 192, cw, cw * 92 / 600);
    var shot = MBScene.snapshot(1600, 1150);
    g.save();
    g.shadowColor = 'rgba(40,24,10,.25)'; g.shadowBlur = 14; g.shadowOffsetY = 5;
    g.fillStyle = '#05060a'; g.fillRect(pad, photoY, cw, photoH);
    g.restore();
    g.drawImage(shot, pad, photoY, cw, photoH);
    g.strokeStyle = 'rgba(110,80,52,.4)'; g.lineWidth = 1;
    g.strokeRect(pad, photoY, cw, photoH);
    g.font = '34px ' + CN; g.textAlign = 'left'; g.textBaseline = 'middle';
    for (var i = 0; i < Math.max(2, lines.length); i++) {
      var y = messageY + i * LH;
      g.strokeStyle = 'rgba(128,98,70,.2)';
      g.beginPath(); g.moveTo(pad, y + 28); g.lineTo(W - pad, y + 28); g.stroke();
      if (i < lines.length) { g.fillStyle = INK; g.fillText(lines[i], pad + 8, y); }
    }
    var signatureY = Math.max(fromY, H - 170);
    signLine(g, 'From', box.from || '我', W - pad, signatureY, 'right', 68,
      shrink(g, box.from || '我', 44, CN, cw - 180));
    g.strokeStyle = 'rgba(110,80,52,.45)';
    g.beginPath(); g.moveTo(pad, signatureY + 32); g.lineTo(W - pad, signatureY + 32); g.stroke();
    return o.c;
  }

  function toBlob(c) {
    return new Promise(function (ok, bad) { c.toBlob(function (b) { if (b) ok(b); else bad(new Error('导出失败')); }, 'image/png'); });
  }

  function safeName(s) { return String(s || '你').replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 20) || '你'; }

  // ---------- 预览浮层 ----------
  function init(getBox) {
    var $ = function (id) { return document.getElementById(id); };
    var layer = $('posterLayer'), track = $('posterTrack'), img = $('posterImgLetter');
    var saved = null, busy = false;
    function close() { layer.classList.remove('open'); layer.setAttribute('aria-hidden', 'true'); }
    $('posterClose').addEventListener('click', close);
    layer.addEventListener('click', function (e) { if (e.target === layer || e.target === track) close(); });
    document.addEventListener('keydown', function (e) {
      if (layer.classList.contains('open') && e.key === 'Escape') close();
    });

    // 手机上优先走系统分享面板（可以直接存进相册），否则下载
    $('posterSave').addEventListener('click', function () {
      var s = saved;
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
      return Promise.race([p, new Promise(function (resolve) { setTimeout(resolve, 3000); })]).then(function () {
        return toBlob(makeLetter(box)).then(function (blob) {
          var next = { blob: blob, url: URL.createObjectURL(blob), filename: '子守唄の機-To' + safeName(box.to) + '.png' };
          img.src = next.url;
          return (img.decode ? img.decode() : Promise.resolve()).then(function () {
            if (saved) URL.revokeObjectURL(saved.url);
            saved = next;
            img.parentElement.style.setProperty('--ratio', img.naturalWidth / img.naturalHeight);
          }).catch(function (error) { URL.revokeObjectURL(next.url); throw error; });
        });
      }).then(function () {
        layer.classList.add('open'); layer.setAttribute('aria-hidden', 'false');
      }).catch(function (e) {
        console.error(e);
        alert('图片生成失败了：' + e.message);
      }).then(function () {
        if (label) label.textContent = old;
        busy = false;
      });
    };
  }

  window.MBPoster = { init: init, makeLetter: makeLetter };
})();
