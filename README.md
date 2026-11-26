# Palette Tool · Through Their Eyes

The standalone palette and chart checker from [Through Their Eyes](https://fatduckzzz.github.io/through-their-eyes/), an interactive data story about colour vision deficiency (CVD). It runs entirely in your browser: no backend, no tracking, and images are never uploaded.

Live: https://fatduckzzz.github.io/through-their-eyes-palette/

The story has a guided version of this tool (four short acts: see, fix, add a cue, your turn). This repository is the **full tool**: the same checker, wording and look, plus a palette-level repair, an annotated image and a report export.

## What it does

**Palette table.** Add colours or start from a known palette (Okabe–Ito, Tol bright, IBM, Tableau 10, ColorBrewer Set1, red/green). See each colour under protanopia, deuteranopia and tritanopia, find the pairs that lose their difference, and apply a repair for the whole palette.

**Chart checker.** Upload a chart, slide or screenshot. The tool finds the main colours used for categories, shows which two colours lose their difference for which type of colour vision, where on the image they meet, and lists a repair for the whole set of colours (old and new hex values, with a copy button). When no small change works it says so and points to a second cue (labels, dashes, markers). It deliberately does not hand back a recoloured picture: a chart with gradients, shadows or soft edges cannot be recoloured reliably, so apply the new colours in your source file.

**Repair.** `repair.js` changes the colours that sit in a flagged pair *together*, not one pair at a time (the old one-pair suggestion created a new clash in 43% of cases on 120 test charts). It tries lightness alone first, then lightness and saturation, then a little hue, and it will not "fix" a pair by pulling it under the rule's hue gate (the first version did, and made a pair worse; that is closed). It also avoids leaving pairs that only lightness keeps apart. The tool checks the new colours with the same rule and says if pairs remain. In the research evaluation, recolouring the 51 flagged test charts and running the same checker again (up to three passes) left no flagged pair in all 51 and no lightness-only pair in 46; that evaluation recolours flat areas approximately and is not part of the tool. It is the checker grading its own repair, with margins set after seeing an earlier version fail, and it has not been tested with people who have colour-vision deficiency. A crowded palette (Tableau 10, Okabe–Ito) needs large changes, and repair by lightness or hue can fight a chart's meaning, for example a sequential scale. These numbers are exploratory.

**The preset palettes.** Okabe–Ito (Okabe and Ito), Tol bright (Paul Tol), IBM (IBM Design Language), Tableau 10 (Tableau) and ColorBrewer Set1 (Brewer) are published palettes. Some are shown without their neutral colours: Okabe–Ito without black, Tol bright without grey, Set1 without yellow and grey. Copies of Tableau 10 differ by one unit in a few values. "Red / green (demo)" is our own example, not a published palette.

**Heads-up tier.** Pairs whose hue collapses for some type but that a lightness gap of 18 to 32 still separates are listed separately as "kept apart by lightness alone". They are outside the audited rule, which is unchanged.

## The rule

The same rule is used for the palette table and the chart checker: `analyse.js` holds the thresholds, and `pairs.js` applies them to the exact colours in the table. A pair is flagged for a type of colour vision when:

| Condition | Threshold |
| --- | --- |
| The two colours were clearly different to begin with | chroma difference above 25 |
| After simulation the hue difference collapses | chroma difference below 13 |
| or the total difference is too small, and it was lost to the simulation | colour difference below 22, and a loss of at least 12 |
| and lightness does not rescue the pair | lightness difference below 18 |

Lightness is the cue all three types keep, so a large lightness difference is a complete encoding on its own. Without that condition every dark-against-light pair would be flagged.

Spatial contact is not required: bars in a bar chart do not touch, and readers compare them through the legend. Contact only decides where the marker is drawn and how findings are ordered.

The thresholds are the ones frozen before the random audit of 120 public charts described in the story's [method page](https://fatduckzzz.github.io/through-their-eyes/method.html). On that sample the rule agrees closely with a plain CIEDE2000 threshold of about 14, so it is not claimed to be more accurate; what it adds is which cue is lost, a severity grade, where the colours meet, and an explicit lightness escape.

## Limits

- Simulation uses Brettel, Viénot and Mollon (1997), with constants from [libDaltonLens](https://github.com/DaltonLens/libDaltonLens). It models dichromacy, not anomalous trichromacy, and is an approximation, not any one person's perception.
- **The checker has not been validated against people with colour vision deficiency.** A flag is a warning, not proof that a reader fails.
- It checks colour only. Text size, contrast and meaning carried by colour are out of scope, and passing is not a guarantee of readability.
- Main colours are found from peaks in a colour histogram. Photos, gradients and compressed images can give false alarms, and very dense charts can merge small but important colours.

## Run it

No build step, no dependencies.

```bash
python -m http.server 8000
```

```
index.html      page structure
i18n.js         English text, t() and fill()
cvd.js          colour-vision simulation (Brettel 1997) and Lab helpers
pairs.js        the pair rule on exact colours (thresholds from analyse.js)
repair.js       palette-level repair (new; does not touch analyse.js)
ui.js           result summary and pair rows
ctool.js        palette table
analyse.js      chart analysis engine (pure functions)
app.js          page wiring and result rendering
style.css       base layout
prism.css       the story's look: fonts, glow, glass cards, pill chips, shaped severity markers
```

`cvd.js` and `analyse.js` are byte-identical to the copies in the story repository. If you change a threshold, change both places and say so.

Fonts are self-hosted (SIL Open Font License): Fraunces, Hanken Grotesk, Spline Sans Mono.
