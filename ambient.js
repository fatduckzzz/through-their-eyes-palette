/* ============================================================
   ambient.js — 流动的彩色背景

   与主站 through-their-eyes 的实现相同：六团不同色相的径向渐变
   在屏幕上缓慢漂移，用 lighter 合成叠加，再由 CSS 做重模糊。

   两点是刻意保留的：
   - 画布只按视口的 0.42 倍分辨率渲染。反正后面要 blur(46px)，
     全分辨率纯属浪费，缩小后手机上也跑得动。
   - prefers-reduced-motion 时整个模块不启动，连画布都不建。

   背景整屏铺开（与主站相同）。要保护「判断颜色」这件事，靠的是
   把面板做成不透明卡片，而不是限制背景范围——之前把画布压进一条
   270px 高的窄带，却照搬了为整屏调的 blur(46px)，六团颜色被糊成
   一片均匀暗色，等于没有。
   ============================================================ */

(function () {
  'use strict';

  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var cv = document.getElementById('ambient');
  if (!cv || !cv.getContext) return;

  var ctx = cv.getContext('2d');
  var W = 2, H = 2, SCALE = 0.42;

  function resize() {
    W = cv.width = Math.max(2, Math.floor(innerWidth * SCALE));
    H = cv.height = Math.max(2, Math.floor(innerHeight * SCALE));
  }
  resize();
  addEventListener('resize', resize);

  var hues = [6, 30, 140, 178, 210, 266];
  var blobs = [];
  for (var i = 0; i < 6; i++) {
    blobs.push({
      h: hues[i],
      ax: Math.random() * 6.283, ay: Math.random() * 6.283,
      sx: 0.10 + Math.random() * 0.10, sy: 0.09 + Math.random() * 0.10,
      r: 0.48 + Math.random() * 0.34
    });
  }

  var tt = 0;

  /* 第一帧同步画，不等 requestAnimationFrame。

     rAF 在页面不合成帧时不会触发——标签页在后台、窗口被遮住、
     某些省电模式下都会发生。要是把首帧也交给 rAF，这些情况下
     背景就是一片纯黑，看起来像是功能坏了。先画一帧，动画再交给
     rAF 接手。 */
  function frame(schedule) {
    tt += 0.0022;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i];
      var x = (0.5 + 0.43 * Math.sin(b.ax + tt * b.sx * 6.283)) * W;
      var y = (0.5 + 0.43 * Math.cos(b.ay + tt * b.sy * 6.283)) * H;
      var rad = b.r * Math.min(W, H);
      var hue = (b.h + tt * 20) % 360;
      var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'hsla(' + hue + ',85%,58%,0.40)');
      g.addColorStop(1, 'hsla(' + hue + ',85%,58%,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, 6.2832);
      ctx.fill();
    }
    if (schedule !== false) requestAnimationFrame(frame);
  }

  frame(false);                 // 首帧立即可见
  requestAnimationFrame(frame); // 之后交给动画循环

  /* 从后台切回来时补画一帧，避免停在切走那一刻的画面 */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) frame(false);
  });
})();
