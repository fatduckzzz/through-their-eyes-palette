/* Palette-level repair.  NEW module: it does not touch vendor/analyse.js (frozen).
   The frozen checker's own suggestion (analyse.js suggest) moves ONE colour of ONE pair and never looks at the rest of the
   palette; on the 120 test charts 43% of those suggestions created a new collision.  This module repairs the whole set of
   category colours at once, by coordinate descent over candidate colours, in three stages that allow progressively more change:
     1  lightness only (hue and chroma fixed in Lab)       - the cue all three types keep
     2  lightness + chroma scaled 0.75 to 1.15
     3  lightness + chroma + hue rotated up to 24 degrees
   Only colours that sit in a flagged pair may move; every other colour is a fixed constraint.

   What counts as a clash (v2, after a user found the first version "repaired" a pair by moving both colours until the rule stopped
   looking at it, which made the pair worse for deuteranopia):
     HARD   the audited pair rule flags it (thresholds read from CVDAnalyse.CONFIG); or two colours are under MIN_SEP apart in
            typical vision; or typical-vision difference shrinks by more than 5 below min(original, 30); or a pair that relied on
            colour (a*b* gap above ORIGINAL_CHROMA_MIN) is pulled under that gate (+6), which would just exempt it from the rule
     SOFT   a pair that relied on colour has its hue collapse for some type (simulated a*b* gap under 18) and only lightness
            separates it, by less than 32 (the story's "kept apart by lightness alone" tier, outside the audited rule)
   Cost is lexicographic: hard clashes, then soft clashes, then the size of the change.  Deterministic (seeded restarts).
   ES5, no DOM, so it can be ported to the browser. */
var TTERepair = (function () {
  'use strict';
  function make(CVD, C) {
    var TYPES = ['protan', 'deutan', 'tritan'];
    var SOFT_CHROMA = 18, SOFT_LIGHT = 32, GATE_MARGIN = 6, SHRINK = 5, SHRINK_CAP = 30;
    var cache = {}, cacheN = 0;
    function info(rgb) {
      var key = rgb[0] + ',' + rgb[1] + ',' + rgb[2], v = cache[key];
      if (!v) {
        cacheN++;
        v = { rgb: rgb, lab: CVD.rgb2lab(rgb[0], rgb[1], rgb[2]), sim: [] };
        for (var i = 0; i < 3; i++) { var s = CVD.simulate(rgb, TYPES[i]); v.sim.push(CVD.rgb2lab(s[0], s[1], s[2])); }
        cache[key] = v;
      }
      return v;
    }
    function toRgb(L, a, b) { var c = CVD.lab2rgb(L, a, b); return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]; }

    /* the audited pair rule of analyse.js run(), on two colours' info: indexes (0 protan, 1 deutan, 2 tritan) it flags */
    function flaggedI(ia, ib) {
      if (CVD.chromaDelta(ia.lab, ib.lab) <= C.ORIGINAL_CHROMA_MIN) return [];
      var origDE = CVD.deltaE(ia.lab, ib.lab), hits = [];
      for (var i = 0; i < 3; i++) {
        var sa = ia.sim[i], sb = ib.sim[i];
        var sc = CVD.chromaDelta(sa, sb), sl = CVD.lightDelta(sa, sb), sd = CVD.deltaE(sa, sb);
        var hue = sc < C.SIM_CHROMA_MAX && sl < C.SIM_LIGHT_SAFE;
        var close = sd < C.SIM_DE_MAX && sl < C.SIM_LIGHT_SAFE && (origDE - sd) >= C.MIN_DE_LOSS;
        if (hue || close) hits.push(i);
      }
      return hits;
    }
    /* the heads-up tier: hue collapses for a type, lightness alone separates the pair by 18 to 32 (not flagged by the audited rule) */
    function softI(ia, ib, hard) {
      if (CVD.chromaDelta(ia.lab, ib.lab) <= C.ORIGINAL_CHROMA_MIN) return [];
      var out = [];
      for (var i = 0; i < 3; i++) {
        if (hard.indexOf(i) >= 0) continue;
        var sa = ia.sim[i], sb = ib.sim[i];
        if (CVD.chromaDelta(sa, sb) < SOFT_CHROMA && CVD.lightDelta(sa, sb) < SOFT_LIGHT) out.push(i);
      }
      return out;
    }
    function names(ix) { return ix.map(function (i) { return TYPES[i]; }); }
    /* one pair of candidate colours against the pair's original statistics o = { cd0, de0 }: 0 fine, 1 soft clash, 2 hard clash */
    function flagOf(ia, ib, o) {
      var cd = CVD.chromaDelta(ia.lab, ib.lab), de = CVD.deltaE(ia.lab, ib.lab);
      if (de < Math.min(C.MIN_SEP, o.de0)) return 2;                    // never crush two colours together
      if (de < Math.min(o.de0, SHRINK_CAP) - SHRINK) return 2;
      if (o.cd0 > C.ORIGINAL_CHROMA_MIN && cd < Math.min(o.cd0 - 1, C.ORIGINAL_CHROMA_MIN + GATE_MARGIN)) return 2;   // do not dodge the rule's gate
      var hard = flaggedI(ia, ib);
      if (hard.length) return 2;
      return softI(ia, ib, hard).length ? 1 : 0;
    }
    function origStats(infos) {
      var P = [];
      for (var i = 0; i < infos.length; i++) { P.push([]); for (var j = 0; j < infos.length; j++) P[i].push({ cd0: CVD.chromaDelta(infos[i].lab, infos[j].lab), de0: CVD.deltaE(infos[i].lab, infos[j].lab) }); }
      return P;
    }
    function counts(curI, P) {                  // hard and soft clashes of a whole set
      var h = 0, s = 0;
      for (var i = 0; i < curI.length; i++) for (var j = i + 1; j < curI.length; j++) { var f = flagOf(curI[i], curI[j], P[i][j]); if (f === 2) h++; else if (f === 1) s++; }
      return { h: h, s: s };
    }
    function costOf(ci, i, curI, P, limit) {    // clashes colour i would have if it were ci (hard weighs 1000, soft 1); stops early once over `limit`
      var c = 0;
      for (var j = 0; j < curI.length; j++) {
        if (j === i) continue;
        var f = i < j ? flagOf(ci, curI[j], P[i][j]) : flagOf(curI[j], ci, P[j][i]);
        c += f === 2 ? 1000 : f;
        if (c > limit) return c;
      }
      return c;
    }
    /* candidates for one colour at a given stage: lightness (step 3), and per stage chroma and hue */
    function candidates(orig, stage) {
      var o = info(orig).lab, out = [], chromas = [1], rots = [0], L, k, r;
      if (stage >= 2) chromas = [1, 0.75, 1.15];
      if (stage >= 3) rots = [0, -12, 12, -24, 24];
      var ch = Math.sqrt(o[1] * o[1] + o[2] * o[2]), h0 = Math.atan2(o[2], o[1]);
      for (L = 12; L <= 94; L += 3) for (k = 0; k < chromas.length; k++) for (r = 0; r < rots.length; r++) {
        var cc = ch * chromas[k], h = h0 + rots[r] * Math.PI / 180;
        out.push(info(toRgb(L, cc * Math.cos(h), cc * Math.sin(h))));
      }
      out.push(info(orig));
      return out;
    }
    function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

    function runStage(origI, P, movable, stage, restarts) {
      var cand = {}; movable.forEach(function (i) { cand[i] = candidates(origI[i].rgb, stage); });
      var best = null;
      for (var rs = 0; rs < restarts; rs++) {
        var rnd = mulberry(1000 + rs * 7919 + stage);
        var cur = origI.slice();
        for (var pass = 0; pass < 10; pass++) {
          var order = movable.slice().sort(function () { return rnd() - 0.5; }), changed = false;
          for (var oi = 0; oi < order.length; oi++) {
            var i = order[oi], cl = cand[i], bestC = cur[i], bestK = costOf(cur[i], i, cur, P, 1e9), bestS = CVD.deltaE(origI[i].lab, cur[i].lab);
            for (var ci = 0; ci < cl.length; ci++) {
              var k = costOf(cl[ci], i, cur, P, bestK); if (k > bestK) continue;
              var s = CVD.deltaE(origI[i].lab, cl[ci].lab);
              if (k < bestK || s < bestS - 1e-9) { bestC = cl[ci]; bestK = k; bestS = s; }
            }
            if (bestC !== cur[i]) { cur[i] = bestC; changed = true; }
          }
          if (!changed) break;
        }
        var tc = counts(cur, P), sh = 0;
        movable.forEach(function (i) { sh += CVD.deltaE(origI[i].lab, cur[i].lab); });
        var better = !best || tc.h < best.h || (tc.h === best.h && (tc.s < best.s || (tc.s === best.s && sh < best.sh)));
        if (better) best = { cur: cur, h: tc.h, s: tc.s, sh: sh };
        if (best.h === 0 && best.s === 0 && rs >= 1) break;     // nothing left: a few restarts settle on a small change
      }
      return best;
    }
    /* colours: array of [r,g,b].
       Returns { colours, moved:[idx], stage (0 = nothing to do, 1..3 = the stage used, -1 = hard clashes remain),
                 remaining (hard clashes left), soft (soft clashes left), softBefore, shifts:[dE per moved colour] } */
    function repair(colours, opts) {
      opts = opts || {};
      var maxStage = opts.maxStage || 3, restarts = opts.restarts || 5, n = colours.length;
      if (cacheN > 30000) { cache = {}; cacheN = 0; }   /* memo only, and only between runs, so a run never changes halfway; keeps a long browser session bounded */
      var origI = colours.map(info), P = origStats(origI), before = counts(origI, P);
      if (before.h === 0) return { colours: colours, moved: [], stage: 0, remaining: 0, soft: before.s, softBefore: before.s, shifts: [] };
      var inPair = {};
      for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) if (flagOf(origI[i], origI[j], P[i][j])) { inPair[i] = 1; inPair[j] = 1; }
      var movable = Object.keys(inPair).map(Number), best = null, stage;
      for (stage = 1; stage <= maxStage; stage++) {
        var r = runStage(origI, P, movable, stage, restarts);
        if (!best || r.h < best.r.h || (r.h === best.r.h && r.s < best.r.s)) best = { r: r, stage: stage };
        if (r.h === 0 && r.s === 0) break;
      }
      var cols = best.r.cur.map(function (x) { return x.rgb; }), moved = [], shifts = [];
      for (var k = 0; k < n; k++) { var d = CVD.deltaE(origI[k].lab, best.r.cur[k].lab); if (d > 0.5) { moved.push(k); shifts.push(d); } }
      return { colours: cols, moved: moved, stage: best.r.h === 0 ? best.stage : -1, remaining: best.r.h, soft: best.r.s, softBefore: before.s, shifts: shifts };
    }
    /* the audited rule and the heads-up tier on exact colours (rgb arrays) */
    function flaggedTypes(a, b) { return names(flaggedI(info(a), info(b))); }
    function softTypes(a, b) { var ia = info(a), ib = info(b); return names(softI(ia, ib, flaggedI(ia, ib))); }
    function softPairs(colours) {      // every pair in the heads-up tier: [{i, j, types}]
      var out = [];
      for (var i = 0; i < colours.length; i++) for (var j = i + 1; j < colours.length; j++) {
        var ia = info(colours[i]), ib = info(colours[j]), t = softI(ia, ib, flaggedI(ia, ib));
        if (t.length) {
          var light = 1e9; t.forEach(function (k) { var d = CVD.lightDelta(ia.sim[k], ib.sim[k]); if (d < light) light = d; });
          out.push({ i: i, j: j, types: names(t), light: light });
        }
      }
      return out;
    }
    function totalClashes(cols) { var I = cols.map(info); return counts(I, origStats(I)).h; }
    return { repair: repair, flaggedTypes: flaggedTypes, softTypes: softTypes, softPairs: softPairs, totalClashes: totalClashes };
  }
  return { make: make };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = TTERepair;
