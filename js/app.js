/* 页面逻辑：读链接里的纸带码 → 搭场景 → 按钮、寄语卡片、贴纸带码 */
(function () {
  'use strict';
  var MB = window.MB, MBNote = window.MBNote, MBScene = window.MBScene;
  var $ = function (id) { return document.getElementById(id); };
  var current = null; // { marker, box, warnings }

  function readHash() {
    var raw = MB.decodeHash(location.hash);
    var res = raw ? MB.parseMarker(raw) : { ok: false };
    if (!res.ok) {
      var demo = MB.parseMarker(MB.DEMO_MARKER);
      return { marker: MB.DEMO_MARKER, box: demo.box, warnings: [], demo: true, hadHash: !!raw };
    }
    return { marker: raw, box: res.box, warnings: res.warnings, demo: false };
  }

  var toastTimer = 0;
  function toast(text, ms) {
    var t = $('toast');
    t.textContent = text;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, ms || 3200);
  }

  // ---------- 寄语卡片 ----------
  function fillCard(box) {
    $('cardTo').textContent = box.to || '你';
    $('cardFrom').textContent = box.from || '我';
    $('cardMelody').innerHTML = MBNote.melodySVG(box, { width: 600, ink: '#4a3628' });
    var st = $('cardStamp');
    if (box.stamp.length) { st.innerHTML = MBNote.stampSVG(box, { width: 420, height: 76 }); st.classList.remove('hidden'); }
    else { st.innerHTML = ''; st.classList.add('hidden'); }
    $('cardMsg').textContent = box.message || '';
    document.title = 'To ' + (box.to || '你') + ' · 子守唄の機 · The Lullaby Machine';
  }

  function openOverlay(id) { $(id).classList.remove('hidden'); }
  function closeOverlay(id) { $(id).classList.add('hidden'); }

  // ---------- 播放按钮：▶ 播放 / ‖ 暂停 / ↻ 重听 ----------
  var PLAY_TEXT = { play: '播放', pause: '暂停', replay: '重听' };
  function setPlayState(s) {
    var b = $('btnPlay');
    b.dataset.state = s;
    b.classList.toggle('playing', s === 'pause');
    $('playCn').textContent = PLAY_TEXT[s];
    b.setAttribute('aria-label', PLAY_TEXT[s]);
  }

  var audioStarting = false;
  async function onPlay() {
    if (audioStarting) return;
    if (MBScene.isPlaying()) { MBScene.pause(); setPlayState('play'); return; }
    audioStarting = true;
    $('btnPlay').disabled = true;
    try {
      await window.MBAudio.unlock();
      hideHint();
      setPlayState('pause');
      MBScene.play(function () { setPlayState('replay'); });
    } catch (e) {
      setPlayState(MBScene.mode() === 'done' ? 'replay' : 'play');
      toast('声音还没启动，请再点一次播放。iPhone 请检查媒体音量和静音开关，也可在 Safari 中打开。', 10000);
    } finally {
      audioStarting = false;
      $('btnPlay').disabled = false;
    }
  }

  var hintTimer = 0;
  function showHint() {
    var h = $('hint');
    h.classList.remove('hidden', 'fade');
    h.classList.add('entering');
    h.addEventListener('animationend', function () { h.classList.remove('entering'); }, { once: true });
    hintTimer = setTimeout(hideHint, 7000);
  }
  function hideHint() {
    clearTimeout(hintTimer);
    var h = $('hint');
    h.classList.remove('entering');
    h.classList.add('fade');
    setTimeout(function () { h.classList.add('hidden'); }, 1300);
  }

  // ---------- 字体 ----------
  function waitFonts(box, ms) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve(true);
    var text = (box.to || '') + (box.from || '') + (box.message || '') + '你我晚安子守唄の機';
    var all = Promise.all([
      document.fonts.load('40px "Pinyon Script"', 'To From The Lullaby Machine'),
      document.fonts.load('300 40px "LXGW WenKai"', text)
    ]).then(function () { return true; }, function () { return true; });
    return Promise.race([all, new Promise(function (r) { setTimeout(function () { r(false); }, ms); })]);
  }

  // ---------- 换纸带 ----------
  function load(entry, first) {
    current = entry;
    fillCard(entry.box);
    if (MBScene.isPlaying()) MBScene.pause();
    setPlayState('play');
    $('btnPlay').disabled = true;
    return waitFonts(entry.box, 6000).then(function (fontsOk) {
      return MBScene.setBox(entry.box).then(function () {
        $('btnPlay').disabled = false;
        if (!fontsOk) {
          // 字体来晚了：等它到了，把盒盖和纸带重画一遍
          document.fonts.ready.then(function () {
            if (current === entry && !MBScene.isPlaying()) MBScene.setBox(entry.box);
          });
        }
        if (first) {
          var ld = $('loading');
          ld.classList.add('done');
          setTimeout(function () { ld.classList.add('hidden'); }, 1000);
          setTimeout(function () { MBScene.openLid(); }, 500);
          setTimeout(showHint, 2400);
        }
        if (entry.hadHash) toast('Error:纸带码识别错误。迷途的孩子，这不是你的机创作的旋律，听我唱一段，再回去找TA吧。', 10000);
        else if (entry.warnings.length) {
          toast('纸带上有 ' + entry.warnings.length + ' 处小问题，已经自动修好了');
          if (window.console) console.info('[八音盒] 纸带码提示：\n- ' + entry.warnings.join('\n- '));
        }
      });
    });
  }

  function webglOk() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    var ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function bind() {
    $('btnPlay').addEventListener('click', onPlay);
    $('btnLetter').addEventListener('click', function () { hideHint(); openOverlay('letter'); $('card').scrollTop = 0; });
    $('letter').addEventListener('click', function (e) { if (!$('card').contains(e.target)) closeOverlay('letter'); });
    $('btnPaste').addEventListener('click', function () { $('pasteText').value = ''; openOverlay('paste'); });
    $('pasteClose').addEventListener('click', function () { closeOverlay('paste'); });
    $('paste').addEventListener('click', function (e) { if (e.target === $('paste')) closeOverlay('paste'); });
    $('pasteGo').addEventListener('click', function () {
      var raw = MB.decodeHash($('pasteText').value.trim());
      var res = MB.parseMarker(raw);
      if (!res.ok) { toast('没找到 [八音盒:...] 纸带码，检查一下有没有整段复制'); return; }
      closeOverlay('paste');
      var m = /[\[【［]\s*八音盒[\s\S]*$/.exec(raw);
      history.replaceState(null, '', MB.buildLink(location.href, m ? m[0].trim() : raw));
      load({ marker: raw, box: res.box, warnings: res.warnings });
    });
    $('copyLink').addEventListener('click', function () {
      var marker = current && !current.demo ? current.marker : MB.DEMO_MARKER;
      copy(MB.buildLink(location.href, marker)).then(function () { toast('链接已复制'); });
    });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeOverlay('letter'); closeOverlay('paste'); }
      if (e.key === ' ' && e.target === document.body) { e.preventDefault(); if (!$('btnPlay').disabled) onPlay(); }
    });
    window.addEventListener('hashchange', function () { load(readHash()); });
    // 切到后台时停下，免得声音和画面对不上
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && MBScene.isPlaying()) { MBScene.pause(); setPlayState('play'); }
    });
    var openPoster = window.MBPoster.init(function () { return current.box; });
    $('btnSave').addEventListener('click', function () {
      hideHint();
      if (MBScene.isPlaying()) { MBScene.pause(); setPlayState('play'); }
      openPoster($('btnSave'));
    });
  }

  function start() {
    if (!webglOk()) {
      $('loading').classList.add('hidden');
      var f = $('fatal');
      f.innerHTML = '这个浏览器打不开 3D 画面（WebGL 不可用）。<br>换成手机自带浏览器、Chrome、Edge 或 Safari 再试试。';
      f.classList.remove('hidden');
      return;
    }
    try {
      MBScene.init($('scene'));
    } catch (e) {
      $('loading').classList.add('hidden');
      $('fatal').textContent = '八音盒没能打开：' + e.message;
      $('fatal').classList.remove('hidden');
      return;
    }
    bind();
    load(readHash(), true);
  }

  start();
})();
