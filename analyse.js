/* ============================================================
   analyse.js — 找出一张图里"色觉障碍者分不开"的地方

   现有的 CVD 工具几乎都停在"并排模拟"：把原图和模拟图放在一起，
   剩下的靠设计师自己看。Geddes 等 (2025) 对 113 篇文献的范围综述
   把这件事说得很直接——绝大多数工具只做诊断，很少帮设计师找到
   解法；他们列出的第一条研究机会就是"开发能主动协助设计师选择
   可及颜色的工具，而不只是判断某组配色是否不可及"。

   这个模块试着往前走一步：不只是把图变色给你看，而是指出
   **哪两块颜色**在**哪种色觉**下会塌到一起、**它们在图的哪个位置
   贴在一起**，以及可以怎么改。

   判据（三个条件同时成立才算一处问题）
   ------------------------------------------------------------
   1. 原图里这两个颜色本来分得开        ΔE > ORIGINAL_MIN
   2. 模拟之后分不开了                  ΔE < SIMULATED_MAX
   3. 它们在图上真的挨着                相邻像素对数 > CONTACT_MIN

   第 3 条是关键。一张图左上角的红和右下角的绿即使模拟后同色，
   也不构成阅读障碍——没人会把它们放在一起比较。只有当两块颜色
   实际接壤（图例色块相邻、折线交叠、饼图扇区相接）时，塌陷才
   真的伤害理解。跳过这一步会报出大量无关的告警。

   ΔE 用的是 CIE76（ΔE*ab）。它对本用途足够：我们要判断的是
   "明显可分"与"几乎同色"这种量级的差别，不是印刷级的色差控制。

   全部在浏览器本地完成，图片不会离开这台设备。
   ============================================================ */

var CVDAnalyse = (function () {
  'use strict';

  /* 判据用的是**色度**塌陷，不是总色差 ΔE。

     这一点很容易搞错。色觉障碍塌掉的是色度轴（a*b* 平面），明度
     基本不受影响。举个实测的例子：#D72D2D 与 #3CA03C 在绿色盲下
     分别变成 #878716 和 #898942——色相已经完全一样，只剩明度差；
     可总 ΔE 仍有 17.2，用总 ΔE 卡阈值就会漏报。

     所以分两级：
       严重  色度塌了，明度也没拉开     → 基本无法分辨
       中等  色度塌了，但还剩明度差     → 大色块尚可，小图标、
                                          不同屏幕亮度下仍会认错
     两级都报，但在文案里说清楚区别，让设计师自己判断要不要改。 */
  var CONFIG = {
    K: 10,                 // 提取多少个主色
    KMEANS_ITERS: 8,
    SAMPLE_STRIDE: 3,      // 聚类时的像素抽样步长（提速用）
    ORIGINAL_CHROMA_MIN: 25, // 原图里这两色的色度差要够大，才说明设计本来指望靠颜色区分
    SIM_CHROMA_MAX: 13,    // 模拟后色度差小于这个值 → 色相塌陷
    SIM_LIGHT_MAX: 13,     // 明度差也小于这个值 → severity=high
    CONTACT_MIN: 60,       // 相邻像素对少于这个数视为"没挨着"
    MIN_SHARE: 0.004       // 占比低于 0.4% 的主色忽略（多半是抗锯齿产生的过渡色）
  };

  function chromaDelta(a, b) {
    var da = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt(da * da + db * db);
  }

  function lightDelta(a, b) { return Math.abs(a[0] - b[0]); }

  /* ---------- 色彩空间 ---------- */

  function s2l(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

  var S2L = (function () {
    var a = new Float64Array(256);
    for (var i = 0; i < 256; i++) a[i] = s2l(i);
    return a;
  })();

  function rgb2lab(r, g, b) {
    var R = S2L[r], G = S2L[g], B = S2L[b];
    var x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
    var y = (0.2126 * R + 0.7152 * G + 0.0722 * B);
    var z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
    function f(t) { return t > 0.008856 ? Math.pow(t, 1 / 3) : (7.787 * t) + 16 / 116; }
    var fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function deltaE(a, b) {
    var dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt(dl * dl + da * da + db * db);
  }

  /* ---------- CVD 模拟（与主站同一组矩阵，线性空间） ---------- */

  var M = {
    protan: [[0.170556992, 0.829443014, 0], [0.170556991, 0.829443008, 0], [-0.004517144, 0.004517144, 1]],
    deutan: [[0.33066007, 0.66933993, 0], [0.33066007, 0.66933993, 0], [-0.02785538, 0.02785538, 1]],
    tritan: [[1, 0.1273989, -0.1273989], [0, 0.8739093, 0.1260907], [0, 0.8739093, 0.1260907]]
  };

  function l2s(v) {
    v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  }

  function simulate(rgb, type) {
    var m = M[type];
    var lin = [S2L[rgb[0]], S2L[rgb[1]], S2L[rgb[2]]];
    return [
      l2s(m[0][0] * lin[0] + m[0][1] * lin[1] + m[0][2] * lin[2]),
      l2s(m[1][0] * lin[0] + m[1][1] * lin[1] + m[1][2] * lin[2]),
      l2s(m[2][0] * lin[0] + m[2][1] * lin[1] + m[2][2] * lin[2])
    ];
  }

  /* ---------- 主色提取（k-means） ---------- */

  function quantize(data, w, h, k) {
    var px = [], i;

    /* 抽样聚类，全图赋标签。480px 上限的图抽样后约 25k 点，够稳也够快。 */
    for (i = 0; i < data.length; i += 4 * CONFIG.SAMPLE_STRIDE) {
      if (data[i + 3] < 128) continue;                 // 忽略透明像素
      px.push([data[i], data[i + 1], data[i + 2]]);
    }
    if (px.length < k) return null;

    /* 最远点初始化（farthest-point / k-means++ 的确定性版本）。

       别按像素顺序取初始中心：图像是从上到下扫描的，一张上半部
       留白的图表会让前几个中心全落在白色上，聚类随即塌成两三类，
       真正要检查的图例配色反而被合并掉。最远点法保证初始中心在
       色彩空间里铺开，且不依赖随机种子——同一张图每次结果一致，
       这对"给设计师看的报告"是必要的。 */
    var cent = [px[0].slice()];
    var far = new Float64Array(px.length);
    for (i = 0; i < px.length; i++) far[i] = Infinity;

    while (cent.length < k) {
      var last = cent[cent.length - 1];
      var pick = 0, pickD = -1;
      for (i = 0; i < px.length; i++) {
        var dr0 = px[i][0] - last[0], dg0 = px[i][1] - last[1], db0 = px[i][2] - last[2];
        var d0 = dr0 * dr0 + dg0 * dg0 + db0 * db0;
        if (d0 < far[i]) far[i] = d0;
        if (far[i] > pickD) { pickD = far[i]; pick = i; }
      }
      if (pickD <= 0) break;                  // 图里的颜色比 k 还少
      cent.push(px[pick].slice());
    }
    k = cent.length;

    var assign = new Int32Array(px.length);
    for (var it = 0; it < CONFIG.KMEANS_ITERS; it++) {
      for (i = 0; i < px.length; i++) {
        var best = 0, bd = Infinity;
        for (var c = 0; c < k; c++) {
          var dr = px[i][0] - cent[c][0], dg = px[i][1] - cent[c][1], db = px[i][2] - cent[c][2];
          var d = dr * dr + dg * dg + db * db;
          if (d < bd) { bd = d; best = c; }
        }
        assign[i] = best;
      }
      var sum = [], cnt = new Int32Array(k);
      for (c = 0; c < k; c++) sum.push([0, 0, 0]);
      for (i = 0; i < px.length; i++) {
        var a = assign[i];
        sum[a][0] += px[i][0]; sum[a][1] += px[i][1]; sum[a][2] += px[i][2];
        cnt[a]++;
      }
      for (c = 0; c < k; c++) {
        if (!cnt[c]) continue;
        cent[c] = [Math.round(sum[c][0] / cnt[c]), Math.round(sum[c][1] / cnt[c]), Math.round(sum[c][2] / cnt[c])];
      }
    }

    /* 给全图每个像素贴标签 */
    var labels = new Int32Array(w * h);
    var share = new Int32Array(k);
    for (i = 0; i < w * h; i++) {
      var o = i * 4;
      if (data[o + 3] < 128) { labels[i] = -1; continue; }
      var bi = 0, bdist = Infinity;
      for (c = 0; c < k; c++) {
        var r1 = data[o] - cent[c][0], g1 = data[o + 1] - cent[c][1], b1 = data[o + 2] - cent[c][2];
        var dd = r1 * r1 + g1 * g1 + b1 * b1;
        if (dd < bdist) { bdist = dd; bi = c; }
      }
      labels[i] = bi;
      share[bi]++;
    }
    return { centroids: cent, labels: labels, share: share, total: w * h };
  }

  /* ---------- 相邻关系 ---------- */

  /* 扫一遍图，统计每一对标签有多少组"贴着的像素"。比形态学膨胀
     便宜得多，而且顺便记下接触位置，可以直接拿来画框。 */
  function contacts(labels, w, h, k) {
    var pair = {}, i, x, y;
    function bump(a, b, x, y) {
      if (a === b || a < 0 || b < 0) return;
      var key = a < b ? a + ',' + b : b + ',' + a;
      var p = pair[key];
      if (!p) p = pair[key] = { n: 0, x0: w, y0: h, x1: 0, y1: 0 };
      p.n++;
      if (x < p.x0) p.x0 = x;
      if (y < p.y0) p.y0 = y;
      if (x > p.x1) p.x1 = x;
      if (y > p.y1) p.y1 = y;
    }
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        if (x + 1 < w) bump(labels[i], labels[i + 1], x, y);
        if (y + 1 < h) bump(labels[i], labels[i + w], x, y);
      }
    }
    return pair;
  }

  /* ---------- 修改建议 ---------- */

  function rgb2hex(c) {
    return '#' + c.map(function (v) {
      var s = Math.max(0, Math.min(255, v)).toString(16);
      return s.length < 2 ? '0' + s : s;
    }).join('').toUpperCase();
  }

  /* 在保持色相的前提下拉开明度，直到模拟后也能分开。明度差是
     三种色觉障碍都保留得住的线索，比换色相稳妥。 */
  function suggest(a, b, type) {
    var labA = rgb2lab(a[0], a[1], a[2]);
    for (var step = 12; step <= 60; step += 12) {
      for (var dir = 0; dir < 2; dir++) {
        var f = dir ? (1 + step / 100) : (1 - step / 100);
        var cand = [
          Math.round(Math.max(0, Math.min(255, b[0] * f))),
          Math.round(Math.max(0, Math.min(255, b[1] * f))),
          Math.round(Math.max(0, Math.min(255, b[2] * f)))
        ];
        var sa = simulate(a, type), sb = simulate(cand, type);
        var sLabA = rgb2lab(sa[0], sa[1], sa[2]), sLabB = rgb2lab(sb[0], sb[1], sb[2]);
        var candLab = rgb2lab(cand[0], cand[1], cand[2]);

        /* 合格的建议要同时满足两点：模拟后明度拉得开（色度是指望
           不上了），以及改完之后在正常色觉下仍然和原色明显不同——
           否则等于把两个颜色改成了同一个。 */
        if (lightDelta(sLabA, sLabB) > CONFIG.SIM_LIGHT_MAX + 8 &&
            deltaE(labA, candLab) > CONFIG.ORIGINAL_CHROMA_MIN) {
          return { hex: rgb2hex(cand), rgb: cand, simLight: lightDelta(sLabA, sLabB) };
        }
      }
    }
    return null;
  }

  /* ---------- 主入口 ---------- */

  function run(imageData, w, h) {
    var q = quantize(imageData.data, w, h, CONFIG.K);
    if (!q) return { colours: [], findings: [], contactPairs: {} };

    var keep = [];
    for (var c = 0; c < q.centroids.length; c++) {
      if (q.share[c] / q.total >= CONFIG.MIN_SHARE) keep.push(c);
    }

    var pairs = contacts(q.labels, w, h, q.centroids.length);
    var labs = q.centroids.map(function (c) { return rgb2lab(c[0], c[1], c[2]); });
    var simLabs = {};
    ['protan', 'deutan', 'tritan'].forEach(function (tp) {
      simLabs[tp] = q.centroids.map(function (c) {
        var s = simulate(c, tp);
        return rgb2lab(s[0], s[1], s[2]);
      });
    });

    var findings = [];
    for (var ii = 0; ii < keep.length; ii++) {
      for (var jj = ii + 1; jj < keep.length; jj++) {
        var a = keep[ii], b = keep[jj];

        /* 设计本来是不是指望靠颜色区分这两块？色度差不够大就不是。 */
        var origChroma = chromaDelta(labs[a], labs[b]);
        if (origChroma <= CONFIG.ORIGINAL_CHROMA_MIN) continue;

        var key = a < b ? a + ',' + b : b + ',' + a;
        var contact = pairs[key];
        if (!contact || contact.n < CONFIG.CONTACT_MIN) continue;  // 图上没挨着

        ['protan', 'deutan', 'tritan'].forEach(function (tp) {
          var simChroma = chromaDelta(simLabs[tp][a], simLabs[tp][b]);
          if (simChroma >= CONFIG.SIM_CHROMA_MAX) return;          // 色相没塌

          var simLight = lightDelta(simLabs[tp][a], simLabs[tp][b]);

          findings.push({
            type: tp,
            severity: simLight < CONFIG.SIM_LIGHT_MAX ? 'high' : 'moderate',
            a: q.centroids[a], b: q.centroids[b],
            hexA: rgb2hex(q.centroids[a]), hexB: rgb2hex(q.centroids[b]),
            origChroma: origChroma,
            simChroma: simChroma,
            simLight: simLight,
            original: deltaE(labs[a], labs[b]),
            simulated: deltaE(simLabs[tp][a], simLabs[tp][b]),
            contact: contact.n,
            box: { x0: contact.x0, y0: contact.y0, x1: contact.x1, y1: contact.y1 },
            fix: suggest(q.centroids[a], q.centroids[b], tp)
          });
        });
      }
    }

    /* 严重的排前面；同级别里接触面越大越靠前 */
    findings.sort(function (p, r) {
      if (p.severity !== r.severity) return p.severity === 'high' ? -1 : 1;
      return (p.simChroma - r.simChroma) || (r.contact - p.contact);
    });

    return {
      colours: keep.map(function (c) {
        return { rgb: q.centroids[c], hex: rgb2hex(q.centroids[c]), share: q.share[c] / q.total };
      }),
      findings: findings,
      config: CONFIG
    };
  }

  return { run: run, simulate: simulate, rgb2hex: rgb2hex, deltaE: deltaE, rgb2lab: rgb2lab, CONFIG: CONFIG };
})();
