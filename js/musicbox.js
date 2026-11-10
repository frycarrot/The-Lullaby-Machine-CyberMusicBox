/*
 * 赛博纸带八音盒 · 纸带码解析 + 链接生成
 * 浏览器里挂在 window.MB 上；Node 里可以 require() 直接用。
 *
 * 纸带码格式（详见 README.md）：
 *   [八音盒:速度66|拍号3/4|旋律:(1,1+10);(3,12);(5,10)|图形:(1,8);(2,9)|To:你|From:我|寄语:晚安]
 *
 * 坐标 (x,y)：x 是列（时间，1 列 = 1 个八分音符，可写 .5），y 是行（音高，1～15，也可写音名 C4～C6）。
 * 同一个 x 写多个 y（用 + 连接，或分开写多个点）就是和弦。
 */
(function (root) {
  'use strict';

  var BASE_URL = 'https://frycarrot.github.io/The-Lullaby-Machine-CyberMusicBox/';

  // 15 音纸带：C 大调自然音，C4～C6
  var NOTES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6'];
  var MIDI = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84];
  var ROWS = NOTES.length;

  var METERS = { '2/4': 4, '3/4': 6, '4/4': 8, '6/8': 6 }; // 每小节几列（八分音符）

  var LIMITS = {
    maxX: 128,        // 旋律最多 128 列
    maxHoles: 240,    // 旋律最多 240 个孔
    perColumn: 5,     // 同一列最多 5 个孔
    minGap: 1,        // 同一行两个孔至少隔 1 列（音梳要时间回弹）
    stampW: 24,       // 图形戳宽 24 列
    stampDots: 120,
    tempoMin: 40, tempoMax: 120,
    to: 20, from: 20, message: 300
  };

  var DEFAULTS = { tempo: 72, meter: '4/4' };

  // 可选配色，色号从 1 开始，1 号是默认。
  // 纸带和信封都是“看得出色相的淡色”，木色都是深木；三组任意搭配都压在同一个暖调追光下，不会打架。
  var PALETTES = {
    tape: {
      name: '纸带', list: [
        { name: '象牙', paper: '#ede2c8' },
        { name: '樱粉', paper: '#efcfc8' },
        { name: '雾蓝', paper: '#c8d7e8' },
        { name: '薄荷', paper: '#cce0cb' },
        { name: '丁香', paper: '#d9cbe6' },
        { name: '杏黄', paper: '#f0d8a6' }
      ]
    },
    envelope: {
      // env 信封、letter 信纸、lining 封舌内衬（深色底上撒小金星）
      name: '信封', list: [
        { name: '牛皮', env: '#d8c49e', letter: '#f2e8d2', lining: '#1c2340' },
        { name: '豆沙粉', env: '#ddb5aa', letter: '#f5e2dc', lining: '#3b1f2a' },
        { name: '雾蓝', env: '#b4c4d6', letter: '#e6edf4', lining: '#1c2a42' },
        { name: '鼠尾草', env: '#bccbab', letter: '#e9efe0', lining: '#1f3128' },
        { name: '薰衣草', env: '#c8b8d6', letter: '#efe7f4', lining: '#2b2142' },
        { name: '奶咖', env: '#c9b092', letter: '#f2e6d8', lining: '#33231a' }
      ]
    },
    wood: {
      name: '木色', list: [
        { name: '胡桃', base: '#84512b' },
        { name: '深胡桃', base: '#5f3b22' },
        { name: '樱桃木', base: '#7d3d27' },
        { name: '乌木', base: '#45332a' },
        { name: '柚木', base: '#94662c' },
        { name: '烟熏橡木', base: '#5c5550' }
      ]
    }
  };

  // 纸带上的版式（单位：列）。纸带前端先是高音谱号，然后是旋律，虚线孔，图形戳，尾巴。
  var LAYOUT = { head: 4, dashAfter: 3, stampGap: 3.5, tail: 2.5, emptyTail: 4 };

  // 网页自带的示例：一首原创小摇篮曲（3/4 拍），图形戳是月牙和小星星
  var DEMO_MARKER = '[八音盒:速度66|拍号3/4|旋律:(1,1+10);(3,12);(5,10);(7,4+13);(9,12);(11,11);' +
    '(13,1+10);(15,9);(16,8);(17,9);(19,5+9);(22,7);(25,1+10);(27,12);(29,15);(31,6+13);(33,12);(35,10);' +
    '(37,4+11);(39,10);(41,5+9);(43,1+5+8+10)|图形:(1,8);(2,5+6+7+8+9+10+11);(3,4+5+6+7+8+9+10+11+12);' +
    '(4,3+4+5+6+7+8+9+10+11+12+13);(5,3+4+5+6+13);(6,3+4+5);(7,2+3+4);(8,3+4);(9,3+4);(10,3+4);(11,4);' +
    '(15,4);(16,12);(17,11+12+13);(18,12);(21,6)|To:你|From:八音盒里的我|寄语:这首曲子很短，只够从关灯走到枕头边。' +
    '我把它打在纸带上，你转一圈，它就唱一遍。今晚不用想明天的事，晚安。]';

  // ---------- 小工具 ----------
  function clip(s, max) {
    s = String(s == null ? '' : s).trim();
    return Array.from(s).slice(0, max).join('');
  }

  function cleanText(s) {
    return String(s || '')
      .replace(/\\n/g, '\n')
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '');
  }

  // 结构部分统一成半角
  function normHead(s) {
    return String(s)
      .replace(/[：]/g, ':').replace(/[（]/g, '(').replace(/[）]/g, ')')
      .replace(/[，]/g, ',').replace(/[；]/g, ';').replace(/[＋]/g, '+').replace(/[／]/g, '/')
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/\s+/g, '');
  }

  function rowOf(token) {
    var t = String(token).trim();
    if (/^\d+$/.test(t)) {
      var n = parseInt(t, 10);
      return n >= 1 && n <= ROWS ? n : null;
    }
    var m = /^([A-Ga-g])([4-6])$/.exec(t);
    if (m) {
      var i = NOTES.indexOf(m[1].toUpperCase() + m[2]);
      return i >= 0 ? i + 1 : null;
    }
    return null;
  }

  function fmtX(x) { return (Math.round(x * 2) / 2).toString(); }

  // 把 "(1,3+5);(2,C5)" 拆成 [{x, ys:[...], raw}]
  function parsePoints(src, label, warnings) {
    var out = [];
    var s = normHead(src);
    var re = /\(([^()]*)\)/g, m, rest = s;
    while ((m = re.exec(s))) {
      var parts = m[1].split(',');
      if (parts.length !== 2) { warnings.push(label + '坐标没看懂：「' + m[0] + '」，已跳过'); continue; }
      var x = Number(parts[0]);
      if (!isFinite(x) || parts[0] === '') { warnings.push(label + '列号没看懂：「' + m[0] + '」，已跳过'); continue; }
      var ys = parts[1].split('+').filter(function (t) { return t !== ''; });
      if (!ys.length) { warnings.push(label + '行号没看懂：「' + m[0] + '」，已跳过'); continue; }
      out.push({ x: x, ys: ys, raw: m[0] });
    }
    rest = s.replace(re, '').replace(/[;,]/g, '');
    if (rest) warnings.push(label + '里有括号外的内容没看懂：「' + rest.slice(0, 20) + '」');
    return out;
  }

  // ---------- 解析 ----------
  var START = /[\[【［]\s*八音盒\s*[:：]/;
  var KEY_TO = /^(to|给|致|送给)\s*[:：]/i;
  var KEY_FROM = /^(from|来自|署名|落款)\s*[:：]/i;
  var KEY_MSG = /(寄语|留言|message)\s*[:：]/i;
  var CLOSERS = [']', '】', '］'];

  function lastCloser(s) {
    var idx = -1;
    CLOSERS.forEach(function (c) { idx = Math.max(idx, s.lastIndexOf(c)); });
    return idx;
  }

  function emptyBox() {
    return {
      tempo: DEFAULTS.tempo, meter: DEFAULTS.meter, colsPerBar: METERS[DEFAULTS.meter],
      tape: 1, envelope: 1, wood: 1,
      melody: [], stamp: [], to: '', from: '', message: ''
    };
  }

  function pickColor(n, pal, warnings) {
    var i = parseInt(n, 10);
    if (i >= 1 && i <= pal.list.length) return i;
    warnings.push(pal.name + '没有 ' + n + ' 号色，已换成 1 号');
    return 1;
  }

  /** 取颜色：kind = tape / envelope / wood，n 从 1 开始 */
  function colorOf(kind, n) {
    var list = PALETTES[kind].list;
    return list[(n >= 1 && n <= list.length ? n : 1) - 1];
  }

  /**
   * 解析一段包含 [八音盒:...] 的文本。
   * 返回 { ok, box, warnings }。
   * box.melody = [{x, rows:[1..15]}]（按 x 升序），box.stamp = [{x, y}]。
   */
  function parseMarker(text, opts) {
    opts = opts || {};
    var warnings = [];
    var box = emptyBox();
    text = String(text || '');
    var m = START.exec(text);
    if (!m) return { ok: false, box: box, warnings: ['没找到 [八音盒:...] 纸带码'] };
    var body = text.slice(m.index + m[0].length);

    var head, message = null;
    var mm = KEY_MSG.exec(body);
    if (mm) {
      head = body.slice(0, mm.index);
      var rest = body.slice(mm.index + mm[0].length);
      var end = lastCloser(rest);
      message = end >= 0 ? rest.slice(0, end) : rest;
      // 家机把 To/From 写在寄语后面时，从尾巴上剥下来
      for (var guard = 0; guard < 2; guard++) {
        var bar = Math.max(message.lastIndexOf('|'), message.lastIndexOf('｜'));
        if (bar < 0) break;
        var tail = message.slice(bar + 1).trim();
        if (KEY_TO.test(tail) || KEY_FROM.test(tail)) { head += '|' + tail; message = message.slice(0, bar); }
        else break;
      }
    } else {
      var firstClose = -1;
      CLOSERS.forEach(function (c) {
        var i = body.indexOf(c);
        if (i >= 0 && (firstClose < 0 || i < firstClose)) firstClose = i;
      });
      head = firstClose >= 0 ? body.slice(0, firstClose) : body;
      warnings.push('没有找到「寄语:」，贺卡会是空的');
    }

    var melodyRaw = null, stampRaw = null;
    head.split(/[|｜]/).forEach(function (raw) {
      var seg = raw.trim();
      if (!seg) return;
      if (KEY_TO.test(seg)) { box.to = clip(cleanText(seg.replace(KEY_TO, '')), LIMITS.to); return; }
      if (KEY_FROM.test(seg)) { box.from = clip(cleanText(seg.replace(KEY_FROM, '')), LIMITS.from); return; }
      var s = normHead(seg), k;
      if ((k = /^(速度|tempo|bpm):?(\d+(?:\.\d+)?)/i.exec(s))) {
        var t = Math.round(Number(k[2]));
        if (t < LIMITS.tempoMin || t > LIMITS.tempoMax) {
          var c = Math.min(LIMITS.tempoMax, Math.max(LIMITS.tempoMin, t));
          warnings.push('速度 ' + t + ' 超出 ' + LIMITS.tempoMin + '～' + LIMITS.tempoMax + '，已改成 ' + c);
          t = c;
        }
        box.tempo = t; return;
      }
      if ((k = /^(拍号|拍子|meter):?(\d)\/(\d)/i.exec(s))) {
        var me = k[2] + '/' + k[3];
        if (METERS[me]) { box.meter = me; box.colsPerBar = METERS[me]; }
        else warnings.push('拍号 ' + me + ' 不支持（可用 2/4、3/4、4/4、6/8），已用 ' + DEFAULTS.meter);
        return;
      }
      // 颜色：纸带2 / 信封3 / 木色4（要放在“旋律”前面判断，因为“纸带:”也是旋律的别名）
      if ((k = /^(纸带色?|纸色|tape|信封色?|信纸|envelope|木色|木头|盒子|wood):?#?(\d+)(?:号|色)?$/i.exec(s))) {
        var kind = /^(纸|tape)/i.test(k[1]) ? 'tape' : /^(信|envelope)/i.test(k[1]) ? 'envelope' : 'wood';
        box[kind] = pickColor(k[2], PALETTES[kind], warnings);
        return;
      }
      if ((k = /^(旋律|melody|纸带|打孔):?/i.exec(s))) { melodyRaw = s.slice(k[0].length); return; }
      if ((k = /^(图形戳|图形|stamp):?/i.exec(s))) { stampRaw = s.slice(k[0].length); return; }
      warnings.push('这一段没看懂，已跳过：「' + seg.slice(0, 20) + '」');
    });

    // 旋律
    if (melodyRaw != null) box.melody = buildMelody(parsePoints(melodyRaw, '旋律', warnings), warnings);
    if (!box.melody.length) {
      if (opts.noDemoFallback) warnings.push('旋律是空的');
      else {
        warnings.push('没有识别到旋律，先放示例曲子');
        box.melody = parseMarker(DEMO_MARKER, { noDemoFallback: true }).box.melody;
      }
    }

    // 图形戳
    if (stampRaw != null) box.stamp = buildStamp(parsePoints(stampRaw, '图形', warnings), warnings);

    if (message != null) {
      var msg = cleanText(message).trim();
      if (Array.from(msg).length > LIMITS.message) warnings.push('寄语超过 ' + LIMITS.message + ' 字，后面的放不下了');
      box.message = clip(msg, LIMITS.message);
    }
    return { ok: true, box: box, warnings: warnings };
  }

  function buildMelody(points, warnings) {
    var cols = {}; // x(字符串) -> [rows]
    points.forEach(function (p) {
      var x = Math.round(p.x * 2) / 2;
      if (x !== p.x) warnings.push('旋律 ' + p.raw + ' 的列号只能是整数或 .5，已改成 ' + fmtX(x));
      if (x < 1 || x > LIMITS.maxX) { warnings.push('旋律 ' + p.raw + ' 超出 1～' + LIMITS.maxX + ' 列，已跳过'); return; }
      p.ys.forEach(function (tok) {
        var r = rowOf(tok);
        if (r == null) { warnings.push('旋律 ' + p.raw + ' 里的「' + tok + '」不是 1～15 行（或 C4～C6 音名），已跳过'); return; }
        var key = String(x);
        cols[key] = cols[key] || [];
        if (cols[key].indexOf(r) < 0) cols[key].push(r);
      });
    });
    var list = Object.keys(cols).map(function (k) { return { x: Number(k), rows: cols[k] }; })
      .sort(function (a, b) { return a.x - b.x; });

    // 同一列太多孔
    list.forEach(function (c) {
      if (c.rows.length > LIMITS.perColumn) {
        warnings.push('第 ' + fmtX(c.x) + ' 列打了 ' + c.rows.length + ' 个孔，最多 ' + LIMITS.perColumn + ' 个，多的去掉了');
        c.rows = c.rows.slice(0, LIMITS.perColumn);
      }
    });
    // 同一行孔距太近：音梳来不及回弹，八音盒其实发不出第二声
    var lastAt = {};
    list.forEach(function (c) {
      c.rows = c.rows.filter(function (r) {
        if (lastAt[r] != null && c.x - lastAt[r] < LIMITS.minGap) {
          warnings.push('第 ' + r + ' 行在第 ' + fmtX(lastAt[r]) + ' 列和第 ' + fmtX(c.x) + ' 列离得太近（至少隔 1 列），后一个孔去掉了');
          return false;
        }
        lastAt[r] = c.x;
        return true;
      });
    });
    list = list.filter(function (c) { return c.rows.length; });
    list.forEach(function (c) { c.rows.sort(function (a, b) { return a - b; }); });

    // 总孔数
    var total = 0, cut = false;
    list = list.filter(function (c) {
      if (cut) return false;
      if (total + c.rows.length > LIMITS.maxHoles) { cut = true; return false; }
      total += c.rows.length;
      return true;
    });
    if (cut) warnings.push('旋律超过 ' + LIMITS.maxHoles + ' 个孔，后面的放不下了');
    return list;
  }

  function buildStamp(points, warnings) {
    var seen = {}, out = [];
    points.forEach(function (p) {
      var x = Math.round(p.x);
      if (x !== p.x) warnings.push('图形 ' + p.raw + ' 的列号只能是整数，已改成 ' + x);
      if (x < 1 || x > LIMITS.stampW) { warnings.push('图形 ' + p.raw + ' 超出 1～' + LIMITS.stampW + ' 列，已跳过'); return; }
      p.ys.forEach(function (tok) {
        var y = /^\d+$/.test(tok) ? parseInt(tok, 10) : NaN;
        if (!(y >= 1 && y <= ROWS)) { warnings.push('图形 ' + p.raw + ' 的行号要在 1～15 之间，已跳过'); return; }
        var key = x + ',' + y;
        if (seen[key]) return;
        seen[key] = 1;
        out.push({ x: x, y: y });
      });
    });
    if (out.length > LIMITS.stampDots) {
      warnings.push('图形戳超过 ' + LIMITS.stampDots + ' 个点，多的去掉了');
      out = out.slice(0, LIMITS.stampDots);
    }
    return out;
  }

  // ---------- 版式与时间 ----------
  /** 纸带版式（单位：列，从纸带前端算起） */
  function layout(box) {
    var maxX = 1;
    box.melody.forEach(function (c) { maxX = Math.max(maxX, c.x); });
    var dashX = Math.floor(maxX) + LAYOUT.dashAfter;          // 虚线孔所在的列
    var dashU = LAYOUT.head + dashX - 1;
    var stampW = 0;
    box.stamp.forEach(function (d) { stampW = Math.max(stampW, d.x); });
    var stampU = dashU + LAYOUT.stampGap;                      // 图形戳第 1 列
    var total = stampW ? stampU + stampW - 1 + LAYOUT.tail : dashU + LAYOUT.emptyTail;
    return {
      head: LAYOUT.head, dashX: dashX, dashU: dashU, stampU: stampU, stampW: stampW, total: total,
      colU: function (x) { return LAYOUT.head + x - 1; },
      colSeconds: 30 / box.tempo                                // 一列 = 八分音符
    };
  }

  function freqOf(row) { return 440 * Math.pow(2, (MIDI[row - 1] - 69) / 12); }

  // ---------- 生成 ----------
  function toMarker(box) {
    var parts = ['速度' + box.tempo, '拍号' + box.meter, '纸带' + (box.tape || 1), '信封' + (box.envelope || 1), '木色' + (box.wood || 1)];
    parts.push('旋律:' + box.melody.map(function (c) { return '(' + fmtX(c.x) + ',' + c.rows.join('+') + ')'; }).join(';'));
    if (box.stamp.length) parts.push('图形:' + box.stamp.map(function (d) { return '(' + d.x + ',' + d.y + ')'; }).join(';'));
    if (box.to) parts.push('To:' + box.to);
    if (box.from) parts.push('From:' + box.from);
    parts.push('寄语:' + (box.message || ''));
    return '[八音盒:' + parts.join('|') + ']';
  }

  function buildLink(base, marker) {
    return String(base || BASE_URL).replace(/#.*$/, '') + '#' + encodeURIComponent(marker);
  }

  /** 逐层解码 # 后的片段，直到能读到纸带码开头。坏掉的百分号不影响其它部分。 */
  function decodeHash(raw) {
    var text = String(raw || '').replace(/^#/, '').trim();
    var header = new RegExp('^' + START.source);
    for (var layer = 0; layer < 5 && !header.test(text); layer++) {
      var next = text.replace(/(?:%[0-9a-f]{2})+/gi, function (run) {
        try { return decodeURIComponent(run); } catch (e) { return run; }
      }).trim();
      if (next === text) break;
      text = next;
    }
    return text;
  }

  var api = {
    BASE_URL: BASE_URL, NOTES: NOTES, MIDI: MIDI, ROWS: ROWS, METERS: METERS, LIMITS: LIMITS,
    DEFAULTS: DEFAULTS, LAYOUT: LAYOUT, DEMO_MARKER: DEMO_MARKER, PALETTES: PALETTES, colorOf: colorOf,
    parseMarker: parseMarker, toMarker: toMarker, buildLink: buildLink, decodeHash: decodeHash,
    layout: layout, freqOf: freqOf
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MB = Object.assign(root.MB || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
