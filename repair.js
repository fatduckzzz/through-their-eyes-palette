/* Palette-level repair.  NEW module: it does not touch vendor/analyse.js (frozen).
   The frozen checker's own suggestion (analyse.js suggest) moves ONE colour of ONE pair and never looks at the rest of the
   palette; on the 120 test charts 43% of those suggestions created a new collision.  This module repairs the whole set of
   category colours at once, with the same pair rule (thresholds read from CVDAnalyse.CONFIG), by coordinate descent over
   candidate colours, in three stages that allow progressively more change:
     1  lightness only (hue and chroma fixed in Lab)       - the cue all three types keep
     2  lightness + chroma scaled 0.7 to 1.15
     3  lightness + chroma + hue rotated up to 30 degrees
   Only colours that sit in a flagged pair may move; every other colour is a fixed constraint.  Cost is lexicographic:
   first the number of clashes (flagged pairs, or two colours under MIN_SEP apart in typical vision), then the size of the
   change from the original colour.  Deterministic (seeded restarts).  ES5, no DOM, so it can be ported to the browser. */
var TTERepair = (function () {
  'use strict';
  function make(CVD, C) {
    var TYPES = ['protan', 'deutan', 'tritan'];
    var cache = {}, cacheN = 0;
    function info(rgb) {
      var key = rgb[0] + ',' + rgb[1] + ',' + rgb[2], v = cache[key];
      if (!v) {
        if (cacheN > 30000) { cache = {}; cacheN = 0; }   /* memo only; keeps a long browser session bounded */
        cacheN++;
        v = { lab: CVD.rgb2lab(rgb[0], rgb[1], rgb[2]), sim: {} };
        for (var i = 0; i < TYPES.length; i++) { var s = CVD.simulate(rgb, TYPES[i]); v.sim[TYPES[i]] = CVD.rgb2lab(s[0], s[1], s[2]); }
        cache[key] = v;
      }
      return v;
    }
    function lab(rgb) { return info(rgb).lab; }
    function toRgb(L, a, b) { var c = CVD.lab2rgb(L, a, b); return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]; }

    /* the pair rule of analyse.js run(), on two exact colours: the types for which the pair is flagged */
    function flaggedTypes(ra, rb) {
      var ia = info(ra), ib = info(rb), la = ia.lab, lb = ib.lab;
      if (CVD.chromaDelta(la, lb) <= C.ORIGINAL_CHROMA_MIN) return [];
      var origDE = CVD.deltaE(la, lb), hits = [];
      for (var i = 0; i < TYPES.length; i++) {
        var tp = TYPES[i], sa = ia.sim[tp], sb = ib.sim[tp];
        var sc = CVD.chromaDelta(sa, sb), sl = CVD.lightDelta(sa, sb), sd = CVD.deltaE(sa, sb);
        var hue = sc < C.SIM_CHROMA_MAX && sl < C.SIM_LIGHT_SAFE;
        var close = sd < C.SIM_DE_MAX && sl < C.SIM_LIGHT_SAFE && (origDE - sd) >= C.MIN_DE_LOSS;
        if (hue || close) hits.push(tp);
      }
      return hits;
    }
    function clashes(rgb, others, skip) {
      var n = 0;
      for (var j = 0; j < others.length; j++) {
        if (j === skip) continue;
        if (flaggedTypes(rgb, others[j]).length) n++;
        else if (CVD.deltaE(lab(rgb), lab(others[j])) < C.MIN_SEP) n++;
      }
      return n;
    }
    function totalClashes(cols) {
      var n = 0;
      for (var i = 0; i < cols.length; i++) for (var j = i + 1; j < cols.length; j++) {
        if (flaggedTypes(cols[i], cols[j]).length) n++;
        else if (CVD.deltaE(lab(cols[i]), lab(cols[j])) < C.MIN_SEP) n++;
      }
      return n;
    }
    /* candidates for one colour at a given stage, keeping hue/chroma per stage */
    function candidates(orig, stage) {
      var o = lab(orig), out = [], chromas = [1], rots = [0], L, k, r, s;
      if (stage >= 2) chromas = [1, 0.7, 0.85, 1.15];
      if (stage >= 3) rots = [0, -10, 10, -20, 20, -30, 30];
      var ch = Math.sqrt(o[1] * o[1] + o[2] * o[2]), h0 = Math.atan2(o[2], o[1]);
      for (L = 12; L <= 94; L += 2) for (k = 0; k < chromas.length; k++) for (r = 0; r < rots.length; r++) {
        var cc = ch * chromas[k], h = h0 + rots[r] * Math.PI / 180;
        var rgb = toRgb(L, cc * Math.cos(h), cc * Math.sin(h));
        out.push(rgb);
      }
      out.push(orig.slice());
      return out;
    }
    function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

    function runStage(orig, movable, stage, restarts) {
      var cand = {}; movable.forEach(function (i) { cand[i] = candidates(orig[i], stage); });
      var best = null;
      for (var rs = 0; rs < restarts; rs++) {
        var rnd = mulberry(1000 + rs * 7919 + stage);
        var cur = orig.map(function (c) { return c.slice(); });
        for (var pass = 0; pass < 12; pass++) {
          var order = movable.slice().sort(function () { return rnd() - 0.5; }), changed = false;
          for (var oi = 0; oi < order.length; oi++) {
            var i = order[oi], cl = cand[i], bestC = cur[i], bestK = clashes(cur[i], cur, i), bestS = CVD.deltaE(lab(orig[i]), lab(cur[i]));
            for (var ci = 0; ci < cl.length; ci++) {
              var k = clashes(cl[ci], cur, i); if (k > bestK) continue;
              var s = CVD.deltaE(lab(orig[i]), lab(cl[ci]));
              if (k < bestK || s < bestS - 1e-9) { bestC = cl[ci]; bestK = k; bestS = s; }
            }
            if (bestC !== cur[i]) { cur[i] = bestC; changed = true; }
          }
          if (!changed) break;
        }
        var tc = totalClashes(cur), sh = 0;
        movable.forEach(function (i) { sh += CVD.deltaE(lab(orig[i]), lab(cur[i])); });
        if (!best || tc < best.tc || (tc === best.tc && sh < best.sh)) best = { cols: cur, tc: tc, sh: sh };
        if (best.tc === 0 && rs >= 3) break;     // zero clashes: a few restarts are enough to settle on a small change
      }
      return best;
    }
    /* colours: array of [r,g,b]; returns { colours, moved:[idx], stage (0 = nothing to do, 1..3, or -1 = not repaired), remaining, shifts:[dE per moved] } */
    function repair(colours, opts) {
      opts = opts || {};
      var maxStage = opts.maxStage || 3, restarts = opts.restarts || 8;
      var n = colours.length, flagged = {};
      for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) if (flaggedTypes(colours[i], colours[j]).length) { flagged[i] = 1; flagged[j] = 1; }
      var movable = Object.keys(flagged).map(Number);
      if (!movable.length) return { colours: colours, moved: [], stage: 0, remaining: totalClashes(colours), shifts: [] };
      var result = null, stage;
      for (stage = 1; stage <= maxStage; stage++) {
        var r = runStage(colours, movable, stage, restarts);
        result = { r: r, stage: stage };
        if (r.tc === 0) break;
      }
      var cols = result.r.cols, moved = [], shifts = [];
      for (var k = 0; k < n; k++) { var d = CVD.deltaE(lab(colours[k]), lab(cols[k])); if (d > 0.5) { moved.push(k); shifts.push(d); } }
      return { colours: cols, moved: moved, stage: result.r.tc === 0 ? result.stage : -1, remaining: result.r.tc, shifts: shifts };
    }
    return { repair: repair, flaggedTypes: flaggedTypes, totalClashes: totalClashes };
  }
  return { make: make };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = TTERepair;
