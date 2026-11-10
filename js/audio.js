/*
 * 八音盒音色：全部用 Web Audio 现场合成，不需要音频文件。
 * 音梳的金属齿 = 一个基音 + 几个很快衰减的泛音 + 一下极短的“拨”声；再过一点房间混响。
 */
(function (root) {
  'use strict';

  var ctx = null, master = null, dry = null, wet = null, playBus = null;

  function ensure() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();

    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3;
    comp.attack.value = 0.004; comp.release.value = 0.25;
    comp.connect(ctx.destination);

    master = ctx.createGain(); master.gain.value = 0.9; master.connect(comp);
    dry = ctx.createGain(); dry.gain.value = 0.82; dry.connect(master);

    var verb = ctx.createConvolver();
    verb.buffer = impulse(2.6, 2.4);
    wet = ctx.createGain(); wet.gain.value = 0.34;
    wet.connect(verb); verb.connect(master);
    return ctx;
  }

  // 必须在点击事件内调用；先请求媒体播放模式，再等待音频时钟真正运行。
  async function unlock() {
    try {
      if (root.navigator && root.navigator.audioSession) root.navigator.audioSession.type = 'playback';
    } catch (e) { /* 不支持此模式的浏览器仍尝试恢复 AudioContext */ }
    var audio = ensure();
    if (!audio) throw new Error('AudioContext unavailable');
    var timer;
    try {
      await Promise.race([
        audio.state === 'running' ? Promise.resolve() : audio.resume(),
        new Promise(function (_, reject) { timer = setTimeout(function () { reject(new Error('Audio start timeout')); }, 4000); })
      ]);
      if (audio.state !== 'running') throw new Error('AudioContext not running');
    } finally { clearTimeout(timer); }
  }

  // 生成一段混响冲激：衰减的立体声噪声，高频衰得更快
  function impulse(seconds, decay) {
    var rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    var buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch), lp = 0;
      for (var i = 0; i < len; i++) {
        var t = i / len;
        lp += (Math.random() * 2 - 1 - lp) * (0.55 - 0.4 * t);
        d[i] = lp * Math.pow(1 - t, decay) * (i < rate * 0.012 ? i / (rate * 0.012) : 1);
      }
    }
    return buf;
  }

  var noiseBuf = null;
  function noise() {
    if (noiseBuf) return noiseBuf;
    var len = Math.floor(ctx.sampleRate * 1.2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  // 播放通道自己接了干声和混响；没有通道时直接接两路
  function out(bus) {
    var g = ctx.createGain();
    if (bus) g.connect(bus);
    else { g.connect(dry); g.connect(wet); }
    return g;
  }

  // 音梳齿：比例、音量、衰减（秒）
  var PARTIALS = [
    [1, 1.0, 2.8],
    [2, 0.10, 1.1],
    [3, 0.035, 0.55],
    [5.4, 0.07, 0.16],
    [8.93, 0.035, 0.07]
  ];

  function pluck(freq, when, vel, bus) {
    var dest = out(bus);
    var brightness = Math.pow(523 / freq, 0.4);
    PARTIALS.forEach(function (p, i) {
      var f = freq * p[0];
      if (f > 16000) return;
      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.0016);
      var g = ctx.createGain();
      var amp = p[1] * vel * (i ? brightness : 1);
      var dec = p[2] * (i ? 1 : Math.pow(523 / freq, 0.3));
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(amp, when + 0.0025);
      g.gain.exponentialRampToValueAtTime(Math.max(amp * 0.0008, 1e-5), when + dec * 2.2);
      o.connect(g); g.connect(dest);
      o.start(when); o.stop(when + dec * 2.3);
    });
    // 拨片碰到齿的一下
    var n = ctx.createBufferSource(); n.buffer = noise();
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.05 * vel, when);
    ng.gain.exponentialRampToValueAtTime(1e-4, when + 0.012);
    n.connect(hp); hp.connect(ng); ng.connect(dest);
    n.start(when, Math.random() * 0.8); n.stop(when + 0.02);
  }

  /** 开始一次播放：返回一个可以统一淡出的通道 */
  function startBus() {
    if (!ensure()) return null;
    if (playBus) stopBus(0.05);
    playBus = ctx.createGain();
    playBus.gain.value = 1;
    playBus.connect(dry);
    playBus.connect(wet);
    return playBus;
  }

  function stopBus(fade) {
    if (!playBus || !ctx) return;
    var b = playBus, t = ctx.currentTime;
    b.gain.cancelScheduledValues(t);
    b.gain.setValueAtTime(b.gain.value, t);
    b.gain.linearRampToValueAtTime(0, t + (fade || 0.35));
    setTimeout(function () { try { b.disconnect(); } catch (e) { /* 已断开 */ } }, ((fade || 0.35) + 0.1) * 1000);
    playBus = null;
  }

  /** 一列和弦：rows 为 1～15 行号 */
  function chord(freqs, when, bus) {
    var vel = 0.24 / Math.sqrt(freqs.length);
    freqs.forEach(function (f, i) {
      // 低音稍微重一点，像真的音梳
      pluck(f, when + i * 0.002, vel * (f < 300 ? 1.15 : 1), bus);
    });
  }

  /** 图形戳炸开的星光声：一串很高、很轻的叮铃 + 一口气声 */
  function sparkle(when) {
    if (!ensure()) return;
    when = when || ctx.currentTime;
    var scale = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093, 2349.3, 2637, 3136, 3520];
    var dest = out();
    for (var i = 0; i < 11; i++) {
      var f = scale[Math.min(scale.length - 1, Math.floor(i * 0.8 + Math.random() * 3))];
      var t = when + i * 0.045 + Math.random() * 0.02;
      var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.76;
      var g = ctx.createGain(), g2 = ctx.createGain();
      var a = 0.035 * (1 - i / 14);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.003);
      g.gain.exponentialRampToValueAtTime(1e-5, t + 0.9);
      g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(a * 0.35, t + 0.002);
      g2.gain.exponentialRampToValueAtTime(1e-5, t + 0.25);
      o.connect(g); o2.connect(g2); g.connect(dest); g2.connect(dest);
      o.start(t); o2.start(t); o.stop(t + 1); o2.stop(t + 0.3);
    }
    var n = ctx.createBufferSource(); n.buffer = noise();
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 7000; bp.Q.value = 0.8;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0, when);
    ng.gain.linearRampToValueAtTime(0.022, when + 0.12);
    ng.gain.exponentialRampToValueAtTime(1e-4, when + 1.1);
    n.connect(bp); bp.connect(ng); ng.connect(dest);
    n.start(when); n.stop(when + 1.15);
  }

  root.MBAudio = {
    ensure: ensure, unlock: unlock,
    now: function () { return ctx ? ctx.currentTime : 0; },
    startBus: startBus, stopBus: stopBus, chord: chord, sparkle: sparkle,
    ready: function () { return !!ctx; }
  };
})(window);
