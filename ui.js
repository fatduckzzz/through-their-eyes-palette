/* ui.js: the result summary and the pair rows, in the same look as the story's palette studio.
   A short serif title, one quiet line, and small chips whose shape (triangle, diamond, ring) carries the meaning, so colour is never
   the only cue. ES5. Needs i18n.js (t, fill). */
var TTEUI = (function () {
  'use strict';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function chip(kind, text) { return '<span class="chip ' + kind + '"><i aria-hidden="true"></i>' + esc(text) + '</span>'; }

  /* n pairs flagged by the audited rule, nHigh of them nearly identical; nSoft more pairs that only lightness keeps apart (a heads-up) */
  function summaryHtml(n, nHigh, nSoft) {
    nHigh = nHigh || 0; nSoft = nSoft || 0;
    if (!n && !nSoft) return '<span class="sum-t">' + esc(t('sum.none.t')) + '</span><span class="sum-s">' + esc(t('sum.none.s')) + '</span>';
    var chips = [];
    if (nHigh) chips.push(chip('hi', fill(t('chip.hi'), { n: nHigh })));
    if (n - nHigh > 0) chips.push(chip('mid', fill(t('chip.mid'), { n: n - nHigh })));
    if (nSoft) chips.push(chip('lt', fill(t('chip.lt'), { n: nSoft })));
    var title = n ? (n === 1 ? t('sum.t.one') : fill(t('sum.t.many'), { n: n })) : t('sum.t.outright');
    return '<span class="sum-t">' + esc(title) + '</span>' + (n ? '<span class="sum-s">' + esc(t('sum.s')) + '</span>' : '') +
      '<span class="sum-chips">' + chips.join('') + '</span>';
  }

  /* one pair as a glass row with two lettered swatches.
     o = { a, b (hex), i, j (0-based palette numbers or null), severity: 'high'|'moderate'|'soft', types: ['deutan',...], de } */
  function pairRow(o) {
    var kind = o.severity === 'high' ? 'sev-hi' : o.severity === 'soft' ? 'sev-lt soft' : 'sev-mid';
    var title = (o.i != null ? '#' + (o.i + 1) + ' ↔ #' + (o.j + 1) : o.a.toUpperCase() + ' ↔ ' + o.b.toUpperCase());
    var hexes = o.i != null ? '<span class="hexes">' + esc(o.a.toUpperCase()) + ' / ' + esc(o.b.toUpperCase()) + '</span>' : '';
    var types = o.types.map(function (x) { return t('ct.' + x); }).join(' / ');
    var status = o.severity === 'soft' ? fill(t('pair.soft'), { types: types })
      : fill(t('pair.affects'), { types: types }) + ' · ' + t(o.severity === 'high' ? 'sev.high' : 'sev.moderate') + (o.de != null ? ' · ΔE ≈ ' + o.de.toFixed(0) : '');
    return '<li class="apair hit ' + kind + '"><div class="aswatches" aria-hidden="true">' +
      '<span class="asw" style="background:' + esc(o.a) + '"><i>A</i></span><span class="asw b" style="background:' + esc(o.b) + '"><i>B</i></span></div>' +
      '<div class="ameta"><b>' + esc(title) + hexes + '</b><span class="st">' + esc(status) + '</span></div></li>';
  }

  return { esc: esc, chip: chip, summaryHtml: summaryHtml, pairRow: pairRow };
})();
