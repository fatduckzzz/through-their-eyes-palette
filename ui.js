/* ui.js: the result summary and the pair rows, in the same look as the story's palette studio.
   A short serif title, one quiet line, and small chips whose shape (triangle, diamond) carries the meaning, so colour is never the only cue.
   ES5. Needs i18n.js (t, fill). */
var TTEUI = (function () {
  'use strict';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function chip(kind, text) { return '<span class="chip ' + kind + '"><i aria-hidden="true"></i>' + esc(text) + '</span>'; }

  /* n pairs flagged, nHigh of them nearly identical. extra.eye (a name) is for a summary about one type only. */
  function summaryHtml(n, nHigh) {
    nHigh = nHigh || 0;
    if (!n) return '<span class="sum-t">' + esc(t('sum.none.t')) + '</span><span class="sum-s">' + esc(t('sum.none.s')) + '</span>';
    var chips = [];
    if (nHigh) chips.push(chip('hi', fill(t('chip.hi'), { n: nHigh })));
    if (n - nHigh > 0) chips.push(chip('mid', fill(t('chip.mid'), { n: n - nHigh })));
    return '<span class="sum-t">' + esc(n === 1 ? t('sum.t.one') : fill(t('sum.t.many'), { n: n })) + '</span>' +
      '<span class="sum-s">' + esc(t('sum.s')) + '</span><span class="sum-chips">' + chips.join('') + '</span>';
  }

  /* one flagged pair as a glass row with two lettered swatches.
     o = { a, b (hex), i, j (0-based palette numbers or null), severity: 'high'|'moderate', types: ['deutan',...], de } */
  function pairRow(o) {
    var near = o.severity === 'high';
    var title = (o.i != null ? '#' + (o.i + 1) + ' ↔ #' + (o.j + 1) : o.a.toUpperCase() + ' ↔ ' + o.b.toUpperCase());
    var hexes = o.i != null ? '<span class="hexes">' + esc(o.a.toUpperCase()) + ' / ' + esc(o.b.toUpperCase()) + '</span>' : '';
    var types = o.types.map(function (x) { return t('ct.' + x); }).join(' / ');
    var status = fill(t('pair.affects'), { types: types }) + ' · ' + t(near ? 'sev.high' : 'sev.moderate') + (o.de != null ? ' · ΔE ≈ ' + o.de.toFixed(0) : '');
    return '<li class="apair hit ' + (near ? 'sev-hi' : 'sev-mid') + '"><div class="aswatches" aria-hidden="true">' +
      '<span class="asw" style="background:' + esc(o.a) + '"><i>A</i></span><span class="asw b" style="background:' + esc(o.b) + '"><i>B</i></span></div>' +
      '<div class="ameta"><b>' + esc(title) + hexes + '</b><span class="st">' + esc(status) + '</span></div></li>';
  }

  return { esc: esc, chip: chip, summaryHtml: summaryHtml, pairRow: pairRow };
})();
