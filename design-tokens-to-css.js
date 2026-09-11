/**
 * ============================================================================
 * Design Tokens → CSS Custom Properties Converter
 * ============================================================================
 *
 * PURPOSE
 * -------
 * Reads the Figma-exported design token file (`design-tokens.tokens.json`) and
 * produces a well-structured CSS file (`design-tokens.css`) containing custom
 * properties (CSS variables) for every token category.
 *
 * DESIGN SYSTEM COLOR ARCHITECTURE
 * --------------------------------
 * The token file follows a **two-tier** color system inspired by Material
 * Design 3:
 *
 *   1. **Primitive Colors** (foundation layer)
 *      Raw color palettes (primary0–100, secondary0–100, etc.) and key colors.
 *      These are the building blocks of the theme and should **never** be
 *      referenced directly in component or page styles.  They exist solely so
 *      that the *Color Roles* layer can alias them.
 *
 *   2. **Color Roles** (semantic / application layer)
 *      Semantic tokens such as `--color-primary`, `--color-on-primary`,
 *      `--color-surface`, etc.  These are the **only** color variables that
 *      should be used in UI code.  Each role's value is an alias that points
 *      back into the primitive palette (e.g.
 *      `{primitives colors.primary color palette.primary40}`).  This script
 *      resolves every alias to its concrete hex/rgba value so the output CSS
 *      is self-contained and requires no runtime resolution.
 *
 * OTHER TOKEN CATEGORIES
 * ----------------------
 *   • **Effects / Shadows** – converted to CSS `box-shadow` shorthand values.
 *   • **Spacing**           – converted to `px` dimension variables.
 *   • **Typography**        – each text style becomes a set of font variables
 *                             (font-size, line-height, letter-spacing, etc.)
 *                             plus a convenience `font` shorthand variable.
 *
 * USAGE
 * -----
 *   node design-tokens-to-css.js
 *
 * The script expects `design-tokens.tokens.json` to be in the same directory.
 * It writes `design-tokens.css` to the same directory.
 *
 * CUSTOMISATION
 * -------------
 * Adjust the constants at the top of the file (INPUT_FILE, OUTPUT_FILE) or the
 * helper functions if your token schema diverges from the Figma Tokens plugin
 * (Lukas Oppermann) export format.
 *
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Path to the source design-token JSON file */
const INPUT_FILE = path.join(__dirname, "design-tokens.tokens.json");

/** Path where the generated CSS file will be written */
const OUTPUT_FILE = path.join(__dirname, "design-tokens.css");

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Converts a token key (e.g. "primary container" or "display large") into a
 * valid, kebab-case CSS custom property segment.
 *
 * Rules applied:
 *   - Trim surrounding whitespace
 *   - Lowercase the string
 *   - Replace one or more spaces/underscores with a single hyphen
 *
 * @param {string} name – The raw token key from JSON.
 * @returns {string} – A kebab-cased segment, e.g. "primary-container".
 */
function toKebabCase(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

/**
 * Converts an 8-character hex colour string (with alpha channel) to a CSS
 * `rgba()` value.  If the alpha byte is `ff` (fully opaque), it falls back to
 * a standard 6-character hex string for brevity and readability.
 *
 * Examples:
 *   "#004ed4ff" → "#004ed4"
 *   "#00000052" → "rgba(0, 0, 0, 0.32)"
 *
 * @param {string} hex8 – An 8-char hex colour (with or without leading `#`).
 * @returns {string} – CSS-ready colour value.
 */
function hex8ToCSS(hex8) {
  // Normalise: ensure leading "#" and lowercase
  const raw = hex8.startsWith("#") ? hex8 : `#${hex8}`;
  const normalised = raw.toLowerCase();

  // Validate length (must be #rrggbbaa — 9 chars with #, or #rrggbb — 7 chars)
  if (normalised.length === 7) {
    // Already a standard 6-digit hex; return as-is
    return normalised;
  }

  if (normalised.length !== 9) {
    // Unexpected format; return unchanged as a fallback
    return normalised;
  }

  const r = parseInt(normalised.slice(1, 3), 16);
  const g = parseInt(normalised.slice(3, 5), 16);
  const b = parseInt(normalised.slice(5, 7), 16);
  const a = parseInt(normalised.slice(7, 9), 16);

  // If fully opaque, drop the alpha channel for cleaner output
  if (a === 255) {
    return `#${normalised.slice(1, 7)}`;
  }

  // Round alpha to two decimal places
  const alpha = Math.round((a / 255) * 100) / 100;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Resolves a Figma Tokens alias reference string to its concrete hex value by
 * walking the primitives colour object.
 *
 * Alias format: `{primitives colors.<group>.<token>}`
 * Example:      `{primitives colors.primary color palette.primary40}`
 *
 * @param {string} aliasString – The raw alias value from the JSON.
 * @param {object} tokens      – The full parsed token JSON object.
 * @returns {string}           – The resolved hex value, or the alias string
 *                                itself if resolution fails (logged as a
 *                                warning).
 */
function resolveColorAlias(aliasString, tokens) {
  // Strip curly braces and leading/trailing whitespace
  const inner = aliasString.replace(/^\{|\}$/g, "").trim();
  // Split on dots to get path segments
  // e.g. "primitives colors.primary color palette.primary40"
  //   → ["primitives colors", "primary color palette", "primary40"]
  const segments = inner.split(".");

  // Walk into the tokens object following each segment
  let current = tokens;
  for (const segment of segments) {
    if (current && typeof current === "object" && segment in current) {
      current = current[segment];
    } else {
      console.warn(
        `  ⚠  Could not resolve alias "${aliasString}" — ` +
          `failed at segment "${segment}".`,
      );
      return aliasString; // Return unresolved as fallback
    }
  }

  // The resolved leaf should have a "value" property with the hex string
  if (current && typeof current === "object" && "value" in current) {
    return current.value;
  }

  // If we resolved to a plain string (unlikely but possible), return it
  if (typeof current === "string") {
    return current;
  }

  console.warn(
    `  ⚠  Alias "${aliasString}" resolved but no "value" found at path.`,
  );
  return aliasString;
}

// ---------------------------------------------------------------------------
// Section generators
// ---------------------------------------------------------------------------

/**
 * Generates the CSS comment block for a given section.
 *
 * @param {string} title       – Section heading (e.g. "COLOR ROLES").
 * @param {string} description – One or more lines describing the section.
 * @returns {string}           – Formatted CSS comment block.
 */
function sectionComment(title, description) {
  const divider = "=".repeat(72);
  const lines = description
    .split("\n")
    .map((l) => `   * ${l}`)
    .join("\n");
  return `\n  /* ${"=".repeat(72)}\n   * ${title}\n   * ${"-".repeat(
    title.length,
  )}\n${lines}\n   * ${"=".repeat(72)} */\n`;
}

/**
 * Processes the "primitives colors" section into CSS custom properties.
 *
 * IMPORTANT: These variables are generated for **internal reference and
 * theming infrastructure only**.  They should NOT be used directly in
 * component styles.  Use the semantic "Color Roles" variables instead.
 *
 * @param {object} primitivesData – The `tokens["primitives colors"]` object.
 * @returns {string}              – CSS variable declarations.
 */
function generatePrimitiveColors(primitivesData) {
  const lines = [];

  lines.push(
    sectionComment(
      "PRIMITIVE COLORS (Foundation Layer)",
      "Raw color palettes that form the building blocks of the theme.\n" +
        "   * ⚠  DO NOT use these variables directly in component styles.\n" +
        "   *    Use the semantic Color Role variables (below) instead.\n" +
        "   *    Primitives exist only to feed into the Color Roles layer.",
    ),
  );

  for (const [groupName, groupTokens] of Object.entries(primitivesData)) {
    const groupSlug = toKebabCase(groupName);

    // Sub-section comment for each palette group
    lines.push(`\n    /* — ${groupName} — */`);

    for (const [tokenName, tokenData] of Object.entries(groupTokens)) {
      // Only process leaf tokens that have a direct colour value
      if (tokenData.type === "color" && typeof tokenData.value === "string") {
        const varName = `--primitive-${groupSlug}-${toKebabCase(tokenName)}`;
        const cssValue = hex8ToCSS(tokenData.value);
        lines.push(`    ${varName}: ${cssValue};`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Processes the "color roles" section into CSS custom properties.
 *
 * Color roles are the **semantic** colour tokens that should be applied in UI
 * code.  Each role references a primitive colour via an alias string; this
 * function resolves each alias to a concrete value.
 *
 * @param {object} rolesData – The `tokens["color roles"]` object.
 * @param {object} tokens    – The full token JSON (needed for alias resolution).
 * @returns {string}         – CSS variable declarations.
 */
function generateColorRoles(rolesData, tokens) {
  const lines = [];

  lines.push(
    sectionComment(
      "COLOR ROLES (Semantic / Application Layer)",
      "Semantic color tokens to be used in UI component and page styles.\n" +
        "   * Each variable maps to a primitive palette value, resolved at\n" +
        "   * build time so no runtime alias resolution is needed.\n" +
        "   *\n" +
        "   * ✅  USE these variables in your CSS / component styles.",
    ),
  );

  for (const [roleName, roleData] of Object.entries(rolesData)) {
    const varName = `--color-${toKebabCase(roleName)}`;
    let cssValue;

    // Check if the value is an alias reference (wrapped in curly braces)
    if (
      typeof roleData.value === "string" &&
      roleData.value.startsWith("{") &&
      roleData.value.endsWith("}")
    ) {
      // Resolve the alias to a concrete hex value
      const resolvedHex = resolveColorAlias(roleData.value, tokens);
      cssValue = hex8ToCSS(resolvedHex);

      // Include the original alias as a comment for traceability
      lines.push(`    /* resolves from: ${roleData.value} */`);
    } else if (typeof roleData.value === "string") {
      // Direct hex value (no alias)
      cssValue = hex8ToCSS(roleData.value);
    } else {
      console.warn(`  ⚠  Unexpected value type for color role "${roleName}".`);
      continue;
    }

    lines.push(`    ${varName}: ${cssValue};`);
  }

  return lines.join("\n");
}

/**
 * Processes the "effect" section (shadows) into CSS custom properties.
 *
 * Each effect token is converted into a `box-shadow` shorthand string:
 *   `offsetX offsetY blurRadius spreadRadius color`
 *
 * @param {object} effectData – The `tokens["effect"]` object.
 * @returns {string}          – CSS variable declarations.
 */
function generateEffects(effectData) {
  const lines = [];

  lines.push(
    sectionComment(
      "EFFECTS / SHADOWS",
      "Pre-defined shadow styles exported from the design system.\n" +
        "   * Apply via `box-shadow: var(--shadow-<name>);`",
    ),
  );

  for (const [effectName, effectToken] of Object.entries(effectData)) {
    if (
      effectToken.type === "custom-shadow" &&
      effectToken.value &&
      typeof effectToken.value === "object"
    ) {
      const v = effectToken.value;
      const color = hex8ToCSS(v.color || "#000000ff");
      const shadow = `${v.offsetX || 0}px ${v.offsetY || 0}px ${
        v.radius || 0
      }px ${v.spread || 0}px ${color}`;
      const varName = `--shadow-${toKebabCase(effectName)}`;
      lines.push(`    ${varName}: ${shadow};`);
    }
  }

  return lines.join("\n");
}

/**
 * Processes the "spacing collection" section into CSS custom properties.
 *
 * All spacing values are emitted in `px` units.
 *
 * @param {object} spacingData – The `tokens["spacing collection"]` object.
 * @returns {string}           – CSS variable declarations.
 */
function generateSpacing(spacingData) {
  const lines = [];

  lines.push(
    sectionComment(
      "SPACING",
      "Spacing scale from the design system.\n" +
        "   * Use for margins, padding, and gaps to maintain visual rhythm.",
    ),
  );

  for (const [spacingName, spacingToken] of Object.entries(spacingData)) {
    if (spacingToken.type === "dimension") {
      const varName = `--spacing-${toKebabCase(spacingName)}`;
      const value = spacingToken.value === 0 ? "0" : `${spacingToken.value}px`;
      lines.push(`    ${varName}: ${value};`);
    }
  }

  return lines.join("\n");
}

/**
 * Processes the "typography" section into CSS custom properties.
 *
 * For each text style (e.g. "display large"), the following variables are
 * generated:
 *   --typography-<style>-font-family
 *   --typography-<style>-font-size
 *   --typography-<style>-font-weight
 *   --typography-<style>-line-height
 *   --typography-<style>-letter-spacing
 *   --typography-<style>-text-decoration
 *   --typography-<style>-text-transform    (from textCase)
 *
 * @param {object} typographyData – The `tokens["typography"]` object.
 * @returns {string}              – CSS variable declarations.
 */
function generateTypography(typographyData) {
  const lines = [];

  lines.push(
    sectionComment(
      "TYPOGRAPHY",
      "Type scale from the design system.  Each text style is broken into\n" +
        "   * individual properties for maximum composability.\n" +
        "   *\n" +
        "   * Usage example:\n" +
        "   *   .heading {\n" +
        "   *     font-family: var(--typography-headline-large-font-family);\n" +
        "   *     font-size:   var(--typography-headline-large-font-size);\n" +
        "   *     font-weight: var(--typography-headline-large-font-weight);\n" +
        "   *     line-height: var(--typography-headline-large-line-height);\n" +
        "   *     letter-spacing: var(--typography-headline-large-letter-spacing);\n" +
        "   *   }",
    ),
  );

  for (const [styleName, styleProps] of Object.entries(typographyData)) {
    const slug = toKebabCase(styleName);
    const prefix = `--typography-${slug}`;

    lines.push(`\n    /* — ${styleName} — */`);

    // Font family
    if (styleProps.fontFamily) {
      lines.push(
        `    ${prefix}-font-family: "${styleProps.fontFamily.value}", sans-serif;`,
      );
    }

    // Font size (px)
    if (styleProps.fontSize) {
      lines.push(`    ${prefix}-font-size: ${styleProps.fontSize.value}px;`);
    }

    // Font weight
    if (styleProps.fontWeight) {
      lines.push(`    ${prefix}-font-weight: ${styleProps.fontWeight.value};`);
    }

    // Font style (normal / italic)
    if (styleProps.fontStyle && styleProps.fontStyle.value !== "normal") {
      lines.push(`    ${prefix}-font-style: ${styleProps.fontStyle.value};`);
    }

    // Line height (px)
    if (styleProps.lineHeight) {
      lines.push(
        `    ${prefix}-line-height: ${styleProps.lineHeight.value}px;`,
      );
    }

    // Letter spacing (px)
    if (styleProps.letterSpacing) {
      lines.push(
        `    ${prefix}-letter-spacing: ${styleProps.letterSpacing.value}px;`,
      );
    }

    // Text decoration
    if (
      styleProps.textDecoration &&
      styleProps.textDecoration.value !== "none"
    ) {
      lines.push(
        `    ${prefix}-text-decoration: ${styleProps.textDecoration.value};`,
      );
    }

    // Text transform (mapped from Figma's "textCase")
    if (styleProps.textCase && styleProps.textCase.value !== "none") {
      lines.push(`    ${prefix}-text-transform: ${styleProps.textCase.value};`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Orchestrates the full conversion pipeline:
 *   1. Read and parse the JSON token file.
 *   2. Generate each CSS section.
 *   3. Assemble the final CSS string.
 *   4. Write the output file.
 */
function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Design Tokens → CSS Custom Properties Converter");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Input:  ${INPUT_FILE}`);
  console.log(`  Output: ${OUTPUT_FILE}`);
  console.log();

  // ── Step 1: Read & parse ──────────────────────────────────────────────
  let rawJSON;
  try {
    rawJSON = fs.readFileSync(INPUT_FILE, "utf-8");
  } catch (err) {
    console.error(`  ✖  Failed to read input file: ${err.message}`);
    process.exit(1);
  }

  let tokens;
  try {
    tokens = JSON.parse(rawJSON);
  } catch (err) {
    console.error(`  ✖  Failed to parse JSON: ${err.message}`);
    process.exit(1);
  }

  console.log("  ✔  Token file loaded and parsed successfully.");

  // ── Step 2: Generate sections ─────────────────────────────────────────
  const sections = [];

  // File header comment
  sections.push(`/**
 * ============================================================================
 * Auto-Generated Design Tokens — CSS Custom Properties
 * ============================================================================
 *
 * Source:    design-tokens.tokens.json (Figma Tokens export)
 * Generated: ${new Date().toISOString()}
 *
 * ⚠  DO NOT EDIT THIS FILE MANUALLY.
 *    Re-run \`node design-tokens-to-css.js\` after updating the source JSON.
 *
 * COLOR SYSTEM ARCHITECTURE
 * -------------------------
 * This file contains two tiers of colour variables:
 *
 *   1. Primitive Colors (--primitive-*)
 *      Foundation palette values.  These exist as an internal reference for
 *      theming infrastructure.  DO NOT use them directly in component CSS.
 *
 *   2. Color Roles (--color-*)
 *      Semantic tokens mapped to specific UI purposes (primary, surface,
 *      error, etc.).  ALWAYS use these in your styles.
 *
 * ============================================================================
 */`);

  // Open :root scope
  sections.push(`:root {`);

  // Effects / Shadows
  if (tokens["effect"]) {
    console.log("  →  Processing effects/shadows…");
    sections.push(generateEffects(tokens["effect"]));
  }

  // Primitive colours (foundation — not for direct UI use)
  if (tokens["primitives colors"]) {
    console.log("  →  Processing primitive colours…");
    sections.push(generatePrimitiveColors(tokens["primitives colors"]));
  }

  // Color roles (semantic — USE THESE in UI)
  if (tokens["color roles"]) {
    console.log("  →  Processing color roles (resolving aliases)…");
    sections.push(generateColorRoles(tokens["color roles"], tokens));
  }

  // Spacing
  if (tokens["spacing collection"]) {
    console.log("  →  Processing spacing tokens…");
    sections.push(generateSpacing(tokens["spacing collection"]));
  }

  // Typography
  if (tokens["typography"]) {
    console.log("  →  Processing typography tokens…");
    sections.push(generateTypography(tokens["typography"]));
  }

  // Close :root scope
  sections.push(`}`);

  // ── Step 3: Assemble ──────────────────────────────────────────────────
  const css = sections.join("\n\n");

  // ── Step 4: Write ─────────────────────────────────────────────────────
  try {
    fs.writeFileSync(OUTPUT_FILE, css, "utf-8");
  } catch (err) {
    console.error(`  ✖  Failed to write output file: ${err.message}`);
    process.exit(1);
  }

  console.log();
  console.log(`  ✔  CSS file written to: ${OUTPUT_FILE}`);
  console.log(
    `     (${css.split("\n").length} lines, ${Buffer.byteLength(
      css,
      "utf-8",
    )} bytes)`,
  );
  console.log();
  console.log("  Done! 🎉");
}

// Run the converter
main();
