/* 配色可及性检查 · 文案
   ct.* 抽自主站 through-their-eyes 的 i18n.js，保持一致；
   an.* 与 foot.* 为本站新增。 */
var I18N = {
  "en": {
    "ct.a11y.cell": "{hex} as seen with {type}",
    "ct.a11y.conflicts": "{n} potential conflicts found",
    "ct.a11y.noconflicts": "No conflicts",
    "ct.a11y.remove": "Remove colour {n}, {hex}",
    "ct.a11y.results": "Accessibility check results",
    "ct.a11y.row": "Colour {n}, {hex}",
    "ct.a11y.swatch": "Colour {n}, {hex}. Select to edit.",
    "ct.add": "+ Add colour",
    "ct.check.apply": "Apply",
    "ct.check.nofix": "No automatic fix found — try adjusting lightness by hand.",
    "ct.check.ok": "No colour pair loses its difference. This palette holds up for all three types.",
    "ct.check.okcommon": "Clear under the two common types — Protanopia and Deuteranopia, together about 8% of men.",
    "ct.check.tritanhead": "Also flagged under Tritanopia — blue–yellow vision, about 1 in 10,000:",
    "ct.check.row": "{a} and {b} are {sev} under {type} (ΔE ≈ {de}).",
    "ct.check.suggest": "Suggested fix: change {b} to {new}.",
    "ct.check.title": "Pairs that lose their difference",
    "ct.deutan": "Deuteranopia",
    "ct.export": "Export report",
    "ct.img.download": "Download",
    "ct.img.label": "Try it on your own image",
    "ct.img.note": "Processed entirely in your browser — nothing is uploaded anywhere. Large images are resized for speed.",
    "ct.img.upload": "Upload image",
    "ct.kicker": "The full palette tool",
    "ct.lede": "Pick any colour on the left. The three columns show how it looks to the most common colour-vision types. If two rows look identical in a column, those colours will be confused — nudge them apart.",
    "ct.next": "I get it now →",
    "ct.note": "Simulation is approximate, using standard dichromacy models. Best practice: never rely on colour alone — add labels, shapes, or patterns too.",
    "ct.presets": "Start from a known palette:",
    "ct.presets.note": "IBM, Okabe–Ito and Tol are the standard categorical palettes. They are tuned for the common red–green deficiencies, so the check still flags a few pairs — mostly under tritanopia (about 1 in 10,000) or as documented trade-offs. That is the ceiling for colour on its own; the answer is a second cue, not a longer search for a perfect palette.",
    "ct.check.refnote": "This is the {name} palette. Palettes like this are built and tested for the common red–green deficiencies, so a red–green pair below is a documented trade-off — Okabe–Ito's orange/yellow is the classic one — and the tritanopia section is stricter than what the palette itself claims. Not a mistake in the palette.",
    "ct.protan": "Protanopia",
    "ct.reset": "Reset",
    "ct.title": "Tune a palette anyone can read.",
    "ct.tritan": "Tritanopia",
    "ct.true": "Your colour",
    "an.title": "Check a real design",
    "an.lede": "Upload a chart, screenshot or mock-up. The tool finds the colour pairs that collapse into each other, and shows you where on the image they touch.",
    "an.figcaption": "A leader line points from each badge to the colours involved; the badge carries the two conflicting colours so you do not have to look back and forth.",
    "an.working": "Analysing…",
    "an.clean": "No collapsing colour pairs found. Every pair that is distinguishable to typical vision stays distinguishable under protanopia, deuteranopia and tritanopia.",
    "an.count": "{n} colour pair(s) lose much of their difference for at least one type of colour vision",
    "an.row.title": "{a} against {b}",
    "an.swatchref": "{hex} (swatch {n})",
    "an.row.fix": "Change {b} to {new}",
    "an.row.nofix": "No lightness-only fix works here without turning it into a different colour. This pair needs a second cue.",
    "an.caveat": "Simulation is an approximation, and this check only looks at colour. A pair that passes here can still be unreadable for other reasons — small type, low contrast, or colour carrying meaning on its own.",
    "foot.about": "Everything runs in your browser. No image is uploaded, and nothing is stored.",
    "an.row.detail.high": "Hue difference collapses from {orig} to {sim} and only {light} of lightness remains — close to indistinguishable.",
    "an.row.detail.moderate": "Hue difference collapses from {orig} to {sim}; a lightness difference of {light} is what is left to tell them apart. Workable on large blocks, unreliable on thin strokes, small icons or a dimmed screen.",
    "an.sev.high": "nearly identical",
    "an.sev.moderate": "harder to tell apart",
    "an.legend": "Hue difference is measured on the a*b* plane of CIELAB — the axis colour vision deficiency actually collapses. Lightness usually survives, which is why it is reported separately.",
    "an.row.types": "Affects {list}",
    "an.row.fix.gain": "lightness separation rises to {light}",
    "an.cue.title": "Add a second cue",
    "an.cue.line": "These read as lines or strokes. Give each one a dash pattern and label it at the end of the line — a texture is invisible at that width.",
    "an.cue.area": "These read as solid blocks. Hatching or a texture works here, and a label placed directly on the block works better still.",
    "an.cue.point": "These read as small marks. Change the marker shape — circle against triangle survives any colour vision.",
    "an.overload": "{n} colours are carrying category information. Past about five, no reader reliably holds the colour-to-category mapping, colour vision aside. Label the categories directly instead of tuning the palette further.",
    "an.copy": "Copy findings for an AI",
    "an.copied": "Copied — paste it into any assistant",
    "an.copy.note": "Copies these results as text. This tool measures colour; an assistant can read what the picture is trying to say.",
    "ct.protan.short": "protanopia",
    "ct.deutan.short": "deuteranopia",
    "ct.tritan.short": "tritanopia",
    "an.export": "Download annotated image ({w}×{h})",
    "an.touching": "These two touch on the image.",
    "an.apart": "These two do not touch, but both carry category information — a reader compares them through the legend.",
    "an.sim.normal": "typical vision",
    "sev.high": "nearly identical",
    "sev.moderate": "harder to tell apart",
    "story.back": "← The story: Through Their Eyes"
  }
};

var LANG = 'en';

function t(key){
  var d = I18N.en;
  return d[key] != null ? d[key] : key;
}

function fill(str, vars){
  return String(str).replace(/\{(\w+)\}/g, function(_, k){
    return vars[k] != null ? vars[k] : '{' + k + '}';
  });
}
