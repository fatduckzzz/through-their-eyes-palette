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
          /* 把上面那张配色表一起传进去：分析器据此把图里的主色对回
             使用者自己的色号，报告才能说"撞的是你配色里的 2 号和 4 号"。 */
          var ref = window.__ctoolPalette ? window.__ctoolPalette() : [];
          var result = CVDAnalyse.run(data, w, h, ref);
          /* 留住原图与缩放比：分析在 480px 上跑（快），但导出要用原分辨率 */
          lastAnalysis = { result: result, imageData: data, w: w, h: h,
                           source: img, scale: scale, palette: ref };
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
    shownCues = {};

    if (!result.findings.length) {
      statusEl.textContent = t('an.clean');
      statusEl.className = 'an-status is-clean';
      addCaveat();
      return;
    }

    statusEl.className = 'an-status is-warn';
    statusEl.textContent = fill(t('an.count'), { n: result.findings.length });

    /* 颜色本身是不是超载了？这跟色觉障碍无关，是更上游的问题：
       类别多到一定程度，谁都记不住颜色对应哪一类。放在最前面，
       因为如果这条成立，下面逐对调色其实是在治标。 */
    if (result.colourOverloaded) {
      var over = document.createElement('div');
      over.className = 'an-overload';
      over.textContent = fill(t('an.overload'), { n: result.categoricalCount });
      listEl.appendChild(over);
    }

    /* 每处问题：图上标一处 + 清单里一条 */
    drawMarkers(ctx, result.findings, 1);
    result.findings.forEach(function (f, i) {
      listEl.appendChild(findingRow(f, i + 1));
    });

    addExportButton(state);
    addCopyButton(result);
    addCaveat();
  }

  /* 把结果拼成一段文字复制走。

     这个工具量的是颜色，量不了语义——它不知道这张图是折线图还是
     饼图、红色在这里代不代表"错误"。那部分交给别的工具：复制过去，
     粘到任意 AI 里问就行。不接 API：纯静态站藏不住 key，而浏览器内
     跑模型对被试的手机来说太重。 */
  /* 导出标注图（原分辨率）。分析在 480px 缩略图上跑是为了快，
     但给设计师的图不该跟着糊。 */
  function addExportButton(state) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn an-export';
    btn.textContent = fill(t('an.export'), {
      w: state.source.naturalWidth, h: state.source.naturalHeight
    });
    btn.addEventListener('click', function () { exportAnnotated(state); });
    listEl.appendChild(btn);
  }

  function addCopyButton(result) {
    var wrapEl = document.createElement('div');
    wrapEl.className = 'an-copy-wrap';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ghost an-copy';
    btn.textContent = t('an.copy');
    btn.addEventListener('click', function () {
      var lines = ['Colour-accessibility findings from an automated check of a design image.',
                   'Measured in CIELAB; "hue difference" is distance on the a*b* plane.', ''];
      if (result.colourOverloaded) {
        lines.push('- ' + result.categoricalCount + ' colours are carrying category information.');
      }
      result.findings.forEach(function (f, i) {
        lines.push((i + 1) + '. ' + f.hexA + ' against ' + f.hexB +
          ' — affects ' + f.types.join(', ') +
          '; hue difference ' + f.origChroma.toFixed(0) + ' -> ' + f.simChroma.toFixed(0) +
          ', lightness left ' + f.simLight.toFixed(0) +
          '; regions read as ' + f.shape +
          (f.fix ? '; a lightness-only fix exists (' + f.hexB + ' -> ' + f.fix.hex + ')'
                 : '; no lightness-only fix'));
      });
      lines.push('', 'What is this image trying to communicate, and which of these actually',
                 'matter for reading it? Suggest fixes that encode the information rather',
                 'than re-encoding the colour.');

      var text = lines.join('\n');
      function done() {
        btn.textContent = t('an.copied');
        setTimeout(function () { btn.textContent = t('an.copy'); }, 2400);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else { fallback(); }

      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { /* 复制失败就算了 */ }
        document.body.removeChild(ta);
      }
    });

    var note = document.createElement('p');
    note.className = 'mono-note';
    note.textContent = t('an.copy.note');

    wrapEl.appendChild(btn);
    wrapEl.appendChild(note);
    listEl.appendChild(wrapEl);
  }

  /* 标注一处冲突。

     经历过两版都不好：
       第一版画一个虚线外接框——两块颜色沿长边相接时框会横跨整张图，
       等于没指出位置。
       第二版沿整条接缝点圆点——把被检查的色块本身盖住了，比框更糟。

     现在的做法是"指出来，但不盖住"：每处冲突只落一枚紧凑徽章，徽章上
     嵌着冲突的那两个颜色；徽章用细引线连到两块颜色各自的位置。挨着的
     一对，引线指向接缝；不挨着的（柱状图里常见的分行系列），两端分别
     指向两块颜色的质心——这恰恰是最需要说清楚"是这两个撞了"的情形。 */
  /* 一次排完所有徽章的位置，再统一画。

     上一版是每处冲突各自定位：取两端中点、往上让 18px、画完收工。单独看
     每一枚都合理，放在一起就糊了——多处冲突涉及的往往是同几个颜色，两端
     中点于是全落在同一小片区域，徽章互相叠住、引线交叉成一团。而且每处
     "先画线再画徽章"，后一条引线会直接横穿前一枚徽章。

     所以拆成两步。先给每枚徽章找一个不与已放置徽章相撞的位置：从"正上方
     18px"开始试，不行就一圈圈往外找，角度从正上方起、优先往上——图表的
     标注习惯是往上引，往下容易压到坐标轴。然后**所有引线先画、所有徽章
     后画**，引线就永远压在徽章底下。 */

  function markerEnds(f, k) {
    /* 挨着就指接缝中点，否则两端分别指向两块颜色的质心——柱状图里分行
       摆放的系列不接壤，恰恰最需要说清"是这两个撞了"。 */
    if (f.touching && f.seam && f.seam.length >= 2) {
      var mid = (f.seam.length / 2) | 0; mid -= mid % 2;
      return [{ x: f.seam[mid] * k, y: f.seam[mid + 1] * k }];
    }
    return [{ x: f.centreA.x * k, y: f.centreA.y * k },
            { x: f.centreB.x * k, y: f.centreB.y * k }];
  }

  /* 把画布切成网格，每处冲突认领离它最近的一个空格。

     试过"从锚点出发一圈圈往外找空位"，不行：它不保证有解。画布小、冲突
     多的时候，外圈的候选点会被逐个截回边界，于是彼此重合、全部判为相撞，
     最后落到兜底分支硬放——实测 13 处冲突只画出 5 枚可辨认的徽章，其余
     叠成了一团。

     网格分配则是构造上不会重叠：槽位互不相交，一个槽只发一次。只要
     槽位数够（480×206 的画布能切出 8×8 = 64 格，而结果通常十几条），
     就一定排得开。代价是徽章吸附到网格、可能离内容远一点——但引线本来
     就是干这个的，而"看得清是哪一枚"比"贴得近"重要。 */
  function layoutMarkers(findings, W, H, k) {
    var bw = 52 * k, bh = 22 * k, pad = 4 * k, gap = 4 * k;
    var stepX = bw + gap, stepY = bh + gap;
    var cols = Math.max(1, Math.floor((W - pad * 2) / stepX));
    var rows = Math.max(1, Math.floor((H - pad * 2) / stepY));

    var slots = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        slots.push({ x: pad + bw / 2 + c * stepX + (W - pad * 2 - cols * stepX) / 2,
                     y: pad + bh / 2 + r * stepY + (H - pad * 2 - rows * stepY) / 2,
                     used: false });
      }
    }

    return findings.map(function (f, i) {
      var ends = markerEnds(f, k);
      var ax = ends.reduce(function (s, p) { return s + p.x; }, 0) / ends.length;
      var ay = ends.reduce(function (s, p) { return s + p.y; }, 0) / ends.length;
      ay -= 14 * k;                     // 略微偏上：图表的标注习惯是往上引

      var best = null, bestD = Infinity;
      for (var si = 0; si < slots.length; si++) {
        if (slots[si].used) continue;
        var dx = slots[si].x - ax, dy = slots[si].y - ay;
        var d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = si; }
      }
      /* 槽位用光了就不画了，返回 null。

         试过把多出来的沿边缘排一列，那等于把"不重叠"这个保证又丢掉——
         480×206 的画布只有 56 格，塞 70 处时边缘列自己就叠了 48 对。
         结果是按严重程度排序的，先占到槽位的正是最要紧的那些；剩下的
         在右侧清单里一条不少。图上少标几处，好过标成一团看不清哪是哪。 */
      if (best === null) return null;
      slots[best].used = true;
      return { f: f, n: i + 1, ends: ends, cx: slots[best].x, cy: slots[best].y };
    });
  }

  function drawMarkers(ctx, findings, k) {
    k = k || 1;
    var items = layoutMarkers(findings, ctx.canvas.width, ctx.canvas.height, k)
                  .filter(Boolean);          // 放不下的不画，见 layoutMarkers

    // ── 第一遍：所有引线和端点小环，细，不遮挡
    ctx.lineCap = ctx.lineJoin = 'round';
    items.forEach(function (it) {
      it.ends.forEach(function (p) {
        [['rgba(255,255,255,.95)', 3.4 * k], ['#111', 1.4 * k]].forEach(function (pass) {
          ctx.strokeStyle = pass[0]; ctx.lineWidth = pass[1];
          ctx.beginPath(); ctx.moveTo(it.cx, it.cy); ctx.lineTo(p.x, p.y); ctx.stroke();
        });
        [['rgba(255,255,255,.95)', 5.2 * k], ['#111', 3.4 * k]].forEach(function (pass) {
          ctx.strokeStyle = pass[0]; ctx.lineWidth = 1.6 * k;
          ctx.beginPath(); ctx.arc(p.x, p.y, pass[1], 0, 6.2832); ctx.stroke();
        });
      });
    });

    // ── 第二遍：徽章压在引线之上
    items.forEach(function (it) { drawBadge(ctx, it, k); });
  }

  function drawBadge(ctx, it, k) {
    var f = it.f, cx = it.cx, cy = it.cy;
    var bw = 52 * k, bh = 22 * k;
    var x = cx - bw / 2, y = cy - bh / 2, r = bh / 2;

    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, r);
    else { ctx.moveTo(x + r, y); ctx.arcTo(x + bw, y, x + bw, y + bh, r);
           ctx.arcTo(x + bw, y + bh, x, y + bh, r); ctx.arcTo(x, y + bh, x, y, r);
           ctx.arcTo(x, y, x + bw, y, r); }
    ctx.fillStyle = '#111'; ctx.fill();
    ctx.lineWidth = 2 * k; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (12 * k) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(it.n), x + 12 * k, cy);

    var sw = 12 * k, sy = cy - sw / 2;
    [f.hexA, f.hexB].forEach(function (hex, i) {
      var sx = x + (23 + i * 14) * k;
      ctx.fillStyle = hex; ctx.fillRect(sx, sy, sw, sw);
      ctx.lineWidth = 1 * k; ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.strokeRect(sx, sy, sw, sw);
    });
  }

  /* 导出：按原图分辨率重画，而不是把 480px 的分析图放大。
     分析在缩略图上跑是为了快，导出给设计师的图不该跟着糊。 */
  function exportAnnotated(state) {
    var src = state.source;
    var W = src.naturalWidth, H = src.naturalHeight;
    var k = W / state.w;                       // 分析坐标 → 原图坐标

    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var x = c.getContext('2d');
    x.drawImage(src, 0, 0, W, H);
    drawMarkers(x, state.result.findings, k);

    c.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'cvd-check-annotated.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }, 'image/png');
  }

  var shownCues = {};

  function findingRow(f, n) {
    var row = document.createElement('div');
    row.className = 'an-row is-' + f.severity;

    /* 标题行：编号 · 两个色块 · 色值 · 严重度 */
    var head = document.createElement('div');
    head.className = 'an-row-head';
    head.appendChild(badge(n));

    var pair = document.createElement('span');
    pair.className = 'an-pair';
    pair.appendChild(swatch(f.hexA));
    pair.appendChild(swatch(f.hexB));
    head.appendChild(pair);

    var title = document.createElement('span');
    title.className = 'an-row-title';
    title.textContent = fill(t('an.row.title'), { a: label(f.hexA, f.paletteA), b: label(f.hexB, f.paletteB) });
    head.appendChild(title);

    var sev = document.createElement('span');
    sev.className = 'an-sev is-' + f.severity;
    sev.textContent = t('an.sev.' + f.severity);
    head.appendChild(sev);
    row.appendChild(head);

    /* 直接把"塌成什么样"画出来。

       原来这里只写一句"影响：蓝黄色盲"和几个数字，而真正有说服力的
       证据——两个颜色在那种色觉下看起来一模一样——被埋在页面最底部的
       四宫格里，得一路划到底再自己对回来。数字要读，色块一眼就懂。 */
    var sims = document.createElement('div');
    sims.className = 'an-sims';

    var normal = document.createElement('div');
    normal.className = 'an-sim';
    normal.appendChild(pairSwatch(f.hexA, f.hexB));
    var nlab = document.createElement('span');
    nlab.textContent = t('an.sim.normal');
    normal.appendChild(nlab);
    sims.appendChild(normal);

    f.types.forEach(function (tp) {
      var cell = document.createElement('div');
      cell.className = 'an-sim is-hit';
      cell.appendChild(pairSwatch(simHex(f.hexA, tp), simHex(f.hexB, tp)));
      var lab = document.createElement('span');
      lab.textContent = t('ct.' + tp + '.short');
      cell.appendChild(lab);
      sims.appendChild(cell);
    });
    row.appendChild(sims);

    var types = document.createElement('p');
    types.className = 'an-row-types';
    types.textContent = t(f.touching ? 'an.touching' : 'an.apart');
    row.appendChild(types);

    var detail = document.createElement('p');
    detail.className = 'an-row-detail';
    detail.textContent = fill(t('an.row.detail.' + f.severity), {
      orig: f.origChroma.toFixed(0),
      sim: f.simChroma.toFixed(0),
      light: f.simLight.toFixed(0)
    });
    row.appendChild(detail);

    /* 改色建议 —— 只有真能拉开明度时才给 */
    var fix = document.createElement('div');
    fix.className = 'an-row-fix';
    if (f.fix) {
      fix.appendChild(swatch(f.hexB, 'is-from'));
      var arrow = document.createElement('span');
      arrow.className = 'an-arrow';
      arrow.textContent = '→';
      fix.appendChild(arrow);
      fix.appendChild(swatch(f.fix.hex));
      var txt = document.createElement('span');
      txt.className = 'an-fix-text';
      txt.textContent = fill(t('an.row.fix'), { b: f.hexB, new: f.fix.hex });
      var gain = document.createElement('em');
      gain.textContent = fill(t('an.row.fix.gain'), { light: f.fix.simLight.toFixed(0) });
      txt.appendChild(gain);
      fix.appendChild(txt);
    } else {
      fix.classList.add('is-nofix');
      fix.textContent = t('an.row.nofix');
    }
    row.appendChild(fix);

    /* 补什么线索，取决于这两块颜色在图上是线、是面还是散点。
       同一种形状的建议只出一次——四条结果重复同一段话是噪音。 */
    if (shownCues[f.shape]) return row;
    shownCues[f.shape] = 1;

    var cue = document.createElement('div');
    cue.className = 'an-cue';
    var cueH = document.createElement('span');
    cueH.className = 'an-cue-h';
    cueH.textContent = t('an.cue.title');
    var cueP = document.createElement('span');
    cueP.textContent = t('an.cue.' + f.shape);
    cue.appendChild(cueH);
    cue.appendChild(cueP);
    row.appendChild(cue);

    return row;
  }

  /* 对得上使用者配色表的，显示成"#2 · #1E88E5"；对不上的只给色值。
     设计师看到序号就知道回上面那张表改哪一行。 */
  /* 原来拼成 "#2 · #249424"，那个 "#2" 看上去像另一个十六进制色号，
     读者要停一下才知道是"配色表里的第 2 格"。写清楚。 */
  function label(hex, match) {
    return match ? fill(t('an.swatchref'), { n: match.index + 1, hex: hex }) : hex;
  }

  function simHex(hex, type) {
    var v = parseInt(hex.slice(1), 16);
    return CVDAnalyse.rgb2hex(CVDAnalyse.simulate([(v >> 16) & 255, (v >> 8) & 255, v & 255], type));
  }

  /* 两个色块贴在一起：中间没有缝，塌了就真的看成一块 */
  function pairSwatch(a, b) {
    var w = document.createElement('span');
    w.className = 'an-pairsw';
    [a, b].forEach(function (hex) {
      var i = document.createElement('i');
      i.style.background = hex;
      i.title = hex;
      w.appendChild(i);
    });
    return w;
  }

  function badge(n) {
    var b = document.createElement('span');
    b.className = 'an-badge';
    b.textContent = n;
    return b;
  }

  function swatch(hex, extra) {
    var s = document.createElement('span');
    s.className = 'an-sw' + (extra ? ' ' + extra : '');
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
