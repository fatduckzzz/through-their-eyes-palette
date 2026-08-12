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
   1. 原图里这两个颜色本来靠色相区分    色度差 > ORIGINAL_CHROMA_MIN
   2. 模拟之后色相塌了                  色度差 < SIM_CHROMA_MAX
   3. 它们在图上真的挨着                相邻像素对数 > CONTACT_MIN

   第 3 条是关键。一张图左上角的红和右下角的绿即使模拟后同色，
   也不构成阅读障碍——没人会把它们放在一起比较。只有当两块颜色
   实际接壤（图例色块相邻、折线交叠、饼图扇区相接）时，塌陷才
   真的伤害理解。跳过这一步会报出大量无关的告警。

   量的是 CIELAB 的 a*b* 平面距离（色度差），不是总 ΔE——色觉障碍
   塌掉的正是这条轴，明度基本不受影响，用总 ΔE 会漏报。

   一对颜色只出一条结果，受影响的色觉类型合并进去。红绿两类色觉
   障碍高度重叠，分开报同一对颜色只会制造噪音。

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
    HIGH_CHROMA_MAX: 8,    // 判 severity=high 的色度上限
    HIGH_LIGHT_MAX: 10,    // 判 severity=high 的明度上限（两者都要满足）
    /* 模拟后明度差达到这个值就不报了。

       色相塌陷本身不等于有问题——白底和青色柱在绿色盲下色相差会从
       35 掉到 2，但两者的明度差有 47，谁都分得开。那一对**本来就不是
       靠色相区分的**，损失掉的东西没人在用。不设这条线就会把每一个
       "深色对浅色"的组合都报成问题，工具随即变成噪音。 */
    SIM_LIGHT_SAFE: 30,
    SIM_LIGHT_TARGET: 28,  // 建议改法要达到的模拟后明度差
    CATEGORICAL_MAX: 5,    // 超过这么多主色在做分类编码，颜色本身就超载了
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

    /* 给全图每个像素贴标签，顺便记下每个主色的外接框——
       后面判断这块颜色是线、是面还是散点要用。 */
    var labels = new Int32Array(w * h);
    var share = new Int32Array(k);
    var bounds = [];
    var sumX = new Float64Array(k), sumY = new Float64Array(k);
    for (c = 0; c < k; c++) bounds.push({ x0: w, y0: h, x1: 0, y1: 0 });

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
      var lx = i % w, ly = (i / w) | 0, bb = bounds[bi];
      if (lx < bb.x0) bb.x0 = lx;
      if (ly < bb.y0) bb.y0 = ly;
      if (lx > bb.x1) bb.x1 = lx;
      if (ly > bb.y1) bb.y1 = ly;
      sumX[bi] += lx; sumY[bi] += ly;
    }
    var centres = [];
    for (c = 0; c < k; c++) {
      centres.push(share[c] ? { x: sumX[c] / share[c], y: sumY[c] / share[c] }
                            : { x: w / 2, y: h / 2 });
    }
    return { centroids: cent, labels: labels, share: share, bounds: bounds,
             centres: centres, total: w * h };
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
      if (!p) p = pair[key] = { n: 0, x0: w, y0: h, x1: 0, y1: 0, pts: [] };
      p.n++;
      if (x < p.x0) p.x0 = x;
      if (y < p.y0) p.y0 = y;
      if (x > p.x1) p.x1 = x;
      if (y > p.y1) p.y1 = y;

      /* 抽样记下真正的接触像素，供标注时描出接缝。

         只给外接框的话，两块颜色沿一条长边相接时框会盖住整张图，
         看不出"到底哪儿撞了"。描出接缝就精确得多。每 7 个取 1、
         上限 400 个点：足够勾出形状，又不会让内存和绘制变重。 */
      if (p.n % 7 === 0 && p.pts.length < 400) p.pts.push(x, y);
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
  function lab2rgb(L, A, B) {
    var fy = (L + 16) / 116, fx = fy + A / 500, fz = fy - B / 200;
    function inv(t) { return t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787; }
    var x = inv(fx) * 0.95047, y = inv(fy), z = inv(fz) * 1.08883;
    var r = 3.2406 * x - 1.5372 * y - 0.4986 * z;
    var g = -0.9689 * x + 1.8758 * y + 0.0415 * z;
    var b = 0.0557 * x - 0.2040 * y + 1.0570 * z;
    return [l2s(r), l2s(g), l2s(b)];
  }

  /* 建议改法：在 Lab 里固定色相与彩度，只推明度。

     上一版是按 RGB 乘一个系数，从 ±12% 起试，第一个过阈值的就返回
     ——结果给出 #66411F → #5A391B 这种同色暗一点点的建议，设计师看了
     等于没看。现在直接在 Lab 空间上找，并且要求模拟后的明度差达到
     SIM_LIGHT_TARGET（够肉眼可靠区分），同时保证改完在正常色觉下仍
     然像"同一个颜色的另一个深浅"，而不是变成另一种颜色。

     找不到就老实返回 null——那意味着这一对靠调颜色救不回来，得加
     颜色之外的线索。这比硬凑一个无效建议诚实。 */
  function suggest(a, b, types) {
    var labB = rgb2lab(b[0], b[1], b[2]);
    var best = null;

    for (var dL = 8; dL <= 55; dL += 3) {
      for (var dir = 0; dir < 2; dir++) {
        var L = labB[0] + (dir ? dL : -dL);
        if (L < 12 || L > 94) continue;                  // 太黑或太白都不好用

        var cand = lab2rgb(L, labB[1], labB[2]);
        var candLab = rgb2lab(cand[0], cand[1], cand[2]);

        /* 必须对**所有**受影响的色觉类型都成立，否则只是把问题
           从一种色觉挪到另一种。 */
        var worst = Infinity;
        for (var i = 0; i < types.length; i++) {
          var sa = simulate(a, types[i]), sb = simulate(cand, types[i]);
          var d = lightDelta(rgb2lab(sa[0], sa[1], sa[2]), rgb2lab(sb[0], sb[1], sb[2]));
          if (d < worst) worst = d;
        }
        if (worst < CONFIG.SIM_LIGHT_TARGET) continue;

        /* 与原色相比要看得出是改过的，但不能面目全非 */
        var shift = deltaE(labB, candLab);
        if (shift < 12) continue;

        if (!best || shift < best.shift) {
          best = { hex: rgb2hex(cand), rgb: cand, simLight: worst, shift: shift };
        }
      }
      if (best) break;          // 由小到大搜，第一个成立的档位就是改动最小的
    }
    return best;
  }

  /* 区域形状决定该补什么线索。给一条 1px 的折线加纹理没有意义，
     给一大块色块加标记形状也没有意义。Geddes 等 (2025) 提醒过：
     冗余编码要编码**信息**，不是编码颜色——具体补什么，得看这块
     颜色在图上是以什么形态出现的。 */
  function shapeOf(box, pixels, w, h) {
    var bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
    var fill = pixels / Math.max(1, bw * bh);
    var area = pixels / (w * h);
    if (area < 0.012) return 'point';        // 零散小块：图例点、标记
    if (fill < 0.3) return 'line';           // 铺得开但填充稀疏：折线、描边
    return 'area';                           // 实心块：柱、扇区、色带
  }

  /* ---------- 主入口 ---------- */

  /* 把图里的主色对回使用者自己那套配色。

     不做这一步，报告只能说"图里这两块颜色撞了"；做了才能说"撞的是
     你配色里的 2 号和 4 号"。后者设计师才知道回去改哪个色值。
     容差用 ΔE 12——量化出来的主色会因抗锯齿和 JPEG 压缩偏离原始色值，
     卡太紧就一个也对不上。 */
  function matchPalette(rgb, paletteLabs) {
    if (!paletteLabs || !paletteLabs.length) return null;
    var lab = rgb2lab(rgb[0], rgb[1], rgb[2]);
    var best = null, bestD = Infinity;
    for (var i = 0; i < paletteLabs.length; i++) {
      var d = deltaE(lab, paletteLabs[i].lab);
      if (d < bestD) { bestD = d; best = i; }
    }
    return bestD <= 12 ? { index: best, hex: paletteLabs[best].hex, delta: bestD } : null;
  }

  function run(imageData, w, h, refPalette) {
    var paletteLabs = (refPalette || []).map(function (hex, i) {
      var m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
      if (!m) return null;
      var v = parseInt(m[1], 16);
      var rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
      return { hex: rgb2hex(rgb), rgb: rgb, lab: rgb2lab(rgb[0], rgb[1], rgb[2]), index: i };
    }).filter(Boolean);

    var q = quantize(imageData.data, w, h, CONFIG.K);
    if (!q) return { colours: [], findings: [], contactPairs: {} };

    var keep = [];
    for (var c = 0; c < q.centroids.length; c++) {
      if (q.share[c] / q.total >= CONFIG.MIN_SHARE) keep.push(c);
    }

    var bounds = q.bounds;
    var pairs = contacts(q.labels, w, h, q.centroids.length);
    var labs = q.centroids.map(function (c) { return rgb2lab(c[0], c[1], c[2]); });

    /* 哪些主色在做"区分类别"这件事？把接近中性的底色、文字色、
       灰阶排除掉，剩下的才是承担分类编码的颜色。

       这套判断有两个用途：一是过滤比较对象（底色不参与），二是
       判断颜色本身是否超载——超过五种时，不论色觉如何，读者都记不住
       颜色与类别的对应关系，那时候该做的是直接标注而不是继续调色。 */
    var categorical = keep.filter(function (c) {
      var lab = labs[c];
      return Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]) > 18;
    });
    var categoricalSet = {};
    categorical.forEach(function (c) { categoricalSet[c] = 1; });

    var simLabs = {};
    ['protan', 'deutan', 'tritan'].forEach(function (tp) {
      simLabs[tp] = q.centroids.map(function (c) {
        var s = simulate(c, tp);
        return rgb2lab(s[0], s[1], s[2]);
      });
    });

    /* 一对颜色出一条，受影响的色觉类型合并进去。

       之前是每个类型各推一条，于是同一对红/棕会以"红色盲"和"绿色盲"
       的名义出现两次，位置一样、建议一样——看起来像是两个问题，实际
       是一个。红绿两类色觉障碍本来就高度重叠，分开报只会制造噪音。 */
    var byPair = {};
    for (var ii = 0; ii < keep.length; ii++) {
      for (var jj = ii + 1; jj < keep.length; jj++) {
        var a = keep[ii], b = keep[jj];

        /* 设计本来是不是指望靠颜色区分这两块？色度差不够大就不是。 */
        var origChroma = chromaDelta(labs[a], labs[b]);
        if (origChroma <= CONFIG.ORIGINAL_CHROMA_MIN) continue;

        /* 两者都得在做"分类编码"（有明确彩度）才比。

           这里原本要求两块颜色在图上**物理接壤**，那是个错误。柱状
           图的各系列本来就分行分列摆着、彼此不挨边，读者靠图例把它们
           联系起来——恰恰是最常见的排布，却被这条规则整个跳过。工具
           自己的配色表那半边（findCollisions）比的就是每一对，没有相邻
           要求；两半边的判据本就该一致。

           噪音改用彩度过滤：底色、文字、灰阶都不参与比较。接壤与否
           降级成元数据，只用来决定标记画在哪、以及排序时谁靠前。 */
        if (categoricalSet[a] !== 1 || categoricalSet[b] !== 1) continue;

        var key = a < b ? a + ',' + b : b + ',' + a;
        var contact = pairs[key] || null;
        var touching = !!(contact && contact.n >= CONFIG.CONTACT_MIN);

        var hits = [];
        ['protan', 'deutan', 'tritan'].forEach(function (tp) {
          var simChroma = chromaDelta(simLabs[tp][a], simLabs[tp][b]);
          if (simChroma >= CONFIG.SIM_CHROMA_MAX) return;          // 色相没塌
          /* 色相塌了不等于分不开。白底和青色柱在绿色盲下色相差会从
             35 掉到 2，但两者的明度差有 47——谁都分得开，那一对本来
             就不是靠色相区分的。不设这条线就会把每个"深色对浅色"的
             组合都报成问题，工具随即变成噪音。 */
          var simLight = lightDelta(simLabs[tp][a], simLabs[tp][b]);
          if (simLight >= CONFIG.SIM_LIGHT_SAFE) return;

          hits.push({ type: tp, simChroma: simChroma, simLight: simLight });
        });
        if (!hits.length) continue;

        /* 以最糟的那一种色觉定严重程度 */
        var worst = hits.reduce(function (m, x) {
          return x.simLight < m.simLight ? x : m;
        }, hits[0]);

        byPair[key] = {
          types: hits.map(function (x) { return x.type; }),
          detail: hits,
          /* "几乎无法分辨"要两个条件都很小才算。原来只看明度，
             结果色度 12、明度 12 这种边缘情况也被打成 high——ΔE 合起来
             约 17，其实是"勉强能分"，标签过重会让人不信任整个工具。 */
          severity: (worst.simChroma < CONFIG.HIGH_CHROMA_MAX &&
                     worst.simLight < CONFIG.HIGH_LIGHT_MAX) ? 'high' : 'moderate',
          a: q.centroids[a], b: q.centroids[b],
          hexA: rgb2hex(q.centroids[a]), hexB: rgb2hex(q.centroids[b]),
          origChroma: origChroma,
          simChroma: worst.simChroma,
          simLight: worst.simLight,
          touching: touching,
          contact: contact ? contact.n : 0,
          box: contact ? { x0: contact.x0, y0: contact.y0, x1: contact.x1, y1: contact.y1 } : null,
          seam: touching ? contact.pts : null,
          centreA: q.centres[a],
          centreB: q.centres[b],
          shape: shapeOf(bounds[b], q.share[b], w, h),
          paletteA: matchPalette(q.centroids[a], paletteLabs),
          paletteB: matchPalette(q.centroids[b], paletteLabs),
          fix: suggest(q.centroids[a], q.centroids[b], hits.map(function (x) { return x.type; }))
        };
      }
    }

    var findings = Object.keys(byPair).map(function (k) { return byPair[k]; });

    /* 严重的排前面；同级别里接触面越大越靠前 */
    findings.sort(function (p, r) {
      if (p.severity !== r.severity) return p.severity === 'high' ? -1 : 1;
      if (p.touching !== r.touching) return p.touching ? -1 : 1;   // 挨着的更要紧
      return (p.simChroma - r.simChroma) || (r.contact - p.contact);
    });

    return {
      colours: keep.map(function (c) {
        return { rgb: q.centroids[c], hex: rgb2hex(q.centroids[c]),
                 share: q.share[c] / q.total,
                 palette: matchPalette(q.centroids[c], paletteLabs) };
      }),
      categoricalCount: categorical.length,
      colourOverloaded: categorical.length > CONFIG.CATEGORICAL_MAX,
      findings: findings,
      config: CONFIG
    };
  }

  return { run: run, simulate: simulate, rgb2hex: rgb2hex, deltaE: deltaE, rgb2lab: rgb2lab, CONFIG: CONFIG };
})();
