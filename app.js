/* ============================================================
   app.js — 页面装配

   职责有三：把 i18n 文案填进 DOM、语言切换、以及把 analyse.js
   的分析结果画出来（标注图 + 问题清单）。

   配色表本身在 ctool.js 里，那是从主站原样抽来的，本文件不碰它。
   ============================================================ */

(function () {
  'use strict';

  /* ---------- i18n ---------- */

  function applyLang() {
    document.documentElement.lang = LANG;
    document.querySelectorAll('[data-i]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i'));
    });
    document.querySelectorAll('#langtoggle button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-lang') === LANG);
    });
    if (window.__ctoolRerender) window.__ctoolRerender();
  }

  document.querySelectorAll('#langtoggle button').forEach(function (b) {
    b.addEventListener('click', function () {
      LANG = b.getAttribute('data-lang');
      applyLang();
      if (lastAnalysis) renderAnalysis(lastAnalysis);
    });
  });

  applyLang();

  /* ---------- 图片分析 ---------- */

  var MAXDIM = 480;                 // 与 ctool.js 的四宫格保持一致
  var TYPE_KEY = { protan: 'ct.protan', deutan: 'ct.deutan', tritan: 'ct.tritan' };

  var wrap = document.getElementById('ctAnalysis');
  var statusEl = document.getElementById('anStatus');
  var canvas = document.getElementById('anCanvas');
  var listEl = document.getElementById('anFindings');
  var input = document.getElementById('ctImgInput');

  var lastAnalysis = null;          // {result, imageData, w, h}

  if (input) {
    input.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) load(f);
    });
  }

  function load(file) {
    wrap.hidden = false;
    statusEl.textContent = t('an.working');
    listEl.innerHTML = '';

    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, MAXDIM / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.max(1, Math.round(img.naturalWidth * scale));
        var h = Math.max(1, Math.round(img.naturalHeight * scale));

        var off = document.createElement('canvas');
        off.width = w; off.height = h;
        var octx = off.getContext('2d');
        octx.drawImage(img, 0, 0, w, h);
        var data = octx.getImageData(0, 0, w, h);

        /* 分析是同步的纯计算，480px 的图在几十毫秒量级；先让"分析中"
           渲染出来再开跑，按钮才不会看起来没反应。

           这里用 setTimeout 而不是 requestAnimationFrame：页面被切到
           后台时浏览器不再合成帧，rAF 的回调会一直不执行，界面就永远
           停在"分析中"。setTimeout 不受此影响。 */
        setTimeout(function () {
          var result = CVDAnalyse.run(data, w, h);
          lastAnalysis = { result: result, imageData: data, w: w, h: h };
          renderAnalysis(lastAnalysis);
        }, 16);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function renderAnalysis(state) {
    var result = state.result, w = state.w, h = state.h;

    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.putImageData(state.imageData, 0, 0);

    listEl.innerHTML = '';

    if (!result.findings.length) {
      statusEl.textContent = t('an.clean');
      statusEl.className = 'an-status is-clean';
      addCaveat();
      return;
    }

    statusEl.className = 'an-status is-warn';
    statusEl.textContent = fill(t('an.count'), { n: result.findings.length });

    /* 每处问题：图上画框 + 清单里一条 */
    result.findings.forEach(function (f, i) {
      drawMarker(ctx, f.box, i + 1, w, h);
      listEl.appendChild(findingRow(f, i + 1));
    });

    addCaveat();
  }

  function drawMarker(ctx, box, n, w, h) {
    var pad = 3;
    var x = Math.max(0, box.x0 - pad), y = Math.max(0, box.y0 - pad);
    var bw = Math.min(w - x, box.x1 - box.x0 + pad * 2);
    var bh = Math.min(h - y, box.y1 - box.y0 + pad * 2);

    /* 白底黑框双描边：标注本身不能只靠颜色区分，深浅图上都要看得见 */
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.strokeRect(x, y, bw, bh);
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#111';
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x, y, bw, bh);
    ctx.setLineDash([]);

    var r = 11, cx = x + r, cy = y + r;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#111'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), cx, cy + 0.5);
  }

  function findingRow(f, n) {
    var row = document.createElement('div');
    row.className = 'an-row';

    var head = document.createElement('div');
    head.className = 'an-row-head';
    head.appendChild(badge(n));
    head.appendChild(swatch(f.hexA));
    head.appendChild(swatch(f.hexB));

    var title = document.createElement('span');
    title.className = 'an-row-title';
    title.textContent = fill(t('an.row.title'), { a: f.hexA, b: f.hexB });
    head.appendChild(title);
    row.appendChild(head);

    var sev = document.createElement('span');
    sev.className = 'an-sev is-' + f.severity;
    sev.textContent = t('an.sev.' + f.severity);
    head.appendChild(sev);

    /* 报色相塌陷与残留明度，而不是总 ΔE。总 ΔE 会把明度算进去，
       于是"色相完全一样、只剩明暗"的情况读起来像是还有差别。 */
    var detail = document.createElement('p');
    detail.className = 'an-row-detail';
    detail.textContent = fill(t('an.row.detail.' + f.severity), {
      type: t(TYPE_KEY[f.type]),
      orig: f.origChroma.toFixed(0),
      sim: f.simChroma.toFixed(0),
      light: f.simLight.toFixed(0)
    });
    row.appendChild(detail);

    var fix = document.createElement('p');
    fix.className = 'an-row-fix';
    if (f.fix) {
      fix.appendChild(swatch(f.fix.hex));
      var span = document.createElement('span');
      span.textContent = fill(t('an.row.fix'), {
        b: f.hexB, new: f.fix.hex, type: t(TYPE_KEY[f.type])
      });
      fix.appendChild(span);
    } else {
      fix.classList.add('is-nofix');
      fix.textContent = t('an.row.nofix');
    }
    row.appendChild(fix);

    return row;
  }

  function badge(n) {
    var b = document.createElement('span');
    b.className = 'an-badge';
    b.textContent = n;
    return b;
  }

  function swatch(hex) {
    var s = document.createElement('span');
    s.className = 'an-sw';
    s.style.background = hex;
    s.title = hex;
    return s;
  }

  /* 工具会漏报，这一点要写在结果旁边而不是藏在页脚。
     Geddes 等 (2025) 特别提醒：模拟"可能出错，并可能误导设计师，
     使其注意力只集中在难以区分的颜色上，而非更广泛的可用性挑战"。 */
  function addCaveat() {
    [t('an.legend'), t('an.caveat')].forEach(function (text) {
      var p = document.createElement('p');
      p.className = 'an-caveat mono-note';
      p.textContent = text;
      listEl.appendChild(p);
    });
  }
})();
