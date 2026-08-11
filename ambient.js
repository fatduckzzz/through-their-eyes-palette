/* ============================================================
   ambient.js — 流动的彩色背景

   与主站 through-their-eyes 的实现相同：六团不同色相的径向渐变
   在屏幕上缓慢漂移，用 lighter 合成叠加，再由 CSS 做重模糊。

   两点是刻意保留的：
   - 画布只按视口的 0.42 倍分辨率渲染。反正后面要 blur(46px)，
     全分辨率纯属浪费，缩小后手机上也跑得动。
   - prefers-reduced-motion 时整个模块不启动，连画布都不建。

   这是个检查颜色的工具，所以背景**只铺在页首**，不铺到配色表和
   分析结果下面——判断颜色的地方必须是中性底色，否则背景会干扰
   你正在评估的那些颜色。这一点与主站不同，主站的背景是通铺的。
   ============================================================ */

(function () {
  'use strict';

  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var cv = document.getElementById('ambient');
  if (!cv || !cv.getContext) return;

  var ctx = cv.getContext('2d');
  var W = 2, H = 2, SCALE = 0.42;

  function resize() {
    var host = cv.parentNode;
    W = cv.width = Math.max(2, Math.floor(host.offsetWidth * SCALE));
    H = cv.height = Math.max(2, Math.floor(host.offsetHeight * SCALE));
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
  function frame() {
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
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
