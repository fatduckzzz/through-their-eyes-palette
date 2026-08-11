/* 配色可及性检查 · 文案
   ct.* 抽自主站 through-their-eyes 的 i18n.js，保持一致；
   an.* 与 foot.* 为本站新增。 */
var I18N = {
  "en": {
    "ct.add": "+ Add colour",
    "ct.check.apply": "Apply",
    "ct.check.nofix": "No automatic fix found — try adjusting lightness by hand.",
    "ct.check.ok": "No collisions detected — every colour stays distinguishable under Protanopia, Deuteranopia, and Tritanopia.",
    "ct.check.row": "{a} and {b} are hard to tell apart under {type} (ΔE ≈ {de}).",
    "ct.check.suggest": "Suggested fix: change {b} to {new}.",
    "ct.check.title": "Accessibility check",
    "ct.deutan": "Deuteranopia",
    "ct.export": "Export report",
    "ct.img.download": "Download",
    "ct.img.label": "Try it on your own image",
    "ct.img.note": "Processed entirely in your browser — nothing is uploaded anywhere. Large images are resized for speed.",
    "ct.img.upload": "Upload image",
    "ct.kicker": "Try it yourself",
    "ct.lede": "Pick any colour on the left. The three columns show how it looks to the most common colour-vision types. If two rows look identical in a column, those colours will be confused — nudge them apart.",
    "ct.next": "I get it now →",
    "ct.note": "Simulation is approximate, using standard dichromacy models. Best practice: never rely on colour alone — add labels, shapes, or patterns too.",
    "ct.presets": "Load a safe palette:",
    "ct.protan": "Protanopia",
    "ct.reset": "Reset",
    "ct.title": "Tune a palette anyone can read.",
    "ct.tritan": "Tritanopia",
    "ct.true": "Your colour",
    "an.title": "Check a real design",
    "an.lede": "Upload a chart, screenshot or mock-up. The tool finds the colour pairs that collapse into each other, and shows you where on the image they touch.",
    "an.figcaption": "Numbered boxes mark where two colours meet that a viewer with the listed deficiency cannot tell apart.",
    "an.working": "Analysing…",
    "an.clean": "No collapsing colour pairs found. Every pair that is distinguishable to typical vision stays distinguishable under protanopia, deuteranopia and tritanopia.",
    "an.count": "{n} place(s) where two colours become hard to tell apart",
    "an.row.title": "{a} and {b} touch here",
    "an.row.fix": "Try changing {b} to {new} — that keeps the pair separable under {type}.",
    "an.row.nofix": "No automatic fix found. Add a second cue here: a shape, a pattern, or a direct label.",
    "an.caveat": "Simulation is an approximation, and this check only looks at colour. A pair that passes here can still be unreadable for other reasons — small type, low contrast, or colour carrying meaning on its own.",
    "foot.about": "Everything runs in your browser. No image is uploaded, and nothing is stored.",
    "an.row.detail.high": "Under {type} the hue difference collapses from {orig} to {sim}, and the lightness difference is only {light}. These are effectively the same colour.",
    "an.row.detail.moderate": "Under {type} the hue difference collapses from {orig} to {sim}. Only a lightness difference of {light} is left — workable on large blocks, unreliable on small icons or a dimmer screen.",
    "an.sev.high": "hard to tell apart",
    "an.sev.moderate": "lightness only",
    "an.legend": "Hue difference is measured on the a*b* plane of CIELAB — the axis colour vision deficiency actually collapses. Lightness usually survives, which is why it is reported separately."
  },
  "zh": {
    "ct.add": "+ 添加颜色",
    "ct.check.apply": "应用修改",
    "ct.check.nofix": "未找到自动修复方案——可尝试手动调整明度。",
    "ct.check.ok": "未检测到冲突——该配色在红色盲、绿色盲、蓝黄色盲下都能被区分。",
    "ct.check.row": "在{type}下，{a} 和 {b} 很难区分（ΔE≈{de}）。",
    "ct.check.suggest": "建议修改：将 {b} 改为 {new}。",
    "ct.check.title": "无障碍检测",
    "ct.deutan": "绿色盲",
    "ct.export": "导出报告",
    "ct.img.download": "下载",
    "ct.img.label": "试试你自己的图片",
    "ct.img.note": "全部在你的浏览器本地处理——不会上传到任何服务器。较大的图片会先缩小以提升速度。",
    "ct.img.upload": "上传图片",
    "ct.kicker": "自己动手试试",
    "ct.lede": "在左边选择颜色，右边会模拟几种常见色觉。如果某一列里有两行看起来太像，就把它们的颜色差距再拉开一点。",
    "ct.next": "继续看证据 →",
    "ct.note": "这里的模拟只能接近真实情况。更稳妥的做法是：颜色可以用，但旁边要补上文字、形状或纹理。",
    "ct.presets": "也可以从这些配色开始：",
    "ct.protan": "红色盲",
    "ct.reset": "重置",
    "ct.title": "调一套不容易看混的配色。",
    "ct.tritan": "蓝黄色盲",
    "ct.true": "你的颜色",
    "an.title": "检查一张真实的设计",
    "an.lede": "上传一张图表、截图或设计稿。工具会找出哪两种颜色会塌到一起，并在图上标出它们接壤的位置。",
    "an.figcaption": "编号方框标出两种颜色接壤、而对应色觉障碍者无法分辨的位置。",
    "an.working": "分析中…",
    "an.clean": "没有发现会塌陷的颜色对。凡是正常色觉能分开的组合，在红色盲、绿色盲和蓝黄色盲下也仍然分得开。",
    "an.count": "发现 {n} 处颜色会变得难以分辨",
    "an.row.title": "{a} 与 {b} 在此处接壤",
    "an.row.fix": "可以把 {b} 改成 {new} —— 这样在{type}下仍然分得开。",
    "an.row.nofix": "没找到自动修改方案。这里需要补一条颜色之外的线索：形状、纹理，或者直接标注。",
    "an.caveat": "模拟只是近似，而且这里只检查了颜色。通过检查不等于就可读——字号太小、对比度不足，或者颜色本身承担了意义，都仍然会造成问题。",
    "foot.about": "全部在你的浏览器里完成。图片不会上传，也不会被保存。",
    "an.row.detail.high": "在{type}下，色相差距从 {orig} 塌到 {sim}，明度差也只有 {light}——两者基本就是同一个颜色。",
    "an.row.detail.moderate": "在{type}下，色相差距从 {orig} 塌到 {sim}，只剩下 {light} 的明度差。大色块还能分，小图标或屏幕偏暗时就会认错。",
    "an.sev.high": "几乎无法分辨",
    "an.sev.moderate": "只剩明度差",
    "an.legend": "色相差距量的是 CIELAB 的 a*b* 平面——那正是色觉障碍会塌掉的那条轴。明度通常不受影响，所以单独列出。"
  }
};

var LANG = (function(){
  var q = /[?&]lang=(en|zh)/.exec(location.search);
  if (q) return q[1];
  return (navigator.language || 'zh').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en';
})();

function t(key){
  var d = I18N[LANG] || I18N.zh;
  return (d && d[key] != null) ? d[key] : (I18N.zh[key] != null ? I18N.zh[key] : key);
}

function fill(str, vars){
  return String(str).replace(/\{(\w+)\}/g, function(_, k){
    return vars[k] != null ? vars[k] : '{' + k + '}';
  });
}
