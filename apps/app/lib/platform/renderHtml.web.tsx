/**
 * Web shim for react-native-render-html
 *
 * Uses dangerouslySetInnerHTML to render HTML content on web.
 * Converts React Native style properties (e.g. numeric lineHeight as pixels)
 * to proper CSS equivalents, and applies per-tag styles via a scoped <style>.
 */

import React, { useId } from "react";

interface RenderHtmlSource {
  html?: string;
  uri?: string;
}

interface RenderHtmlProps {
  source: RenderHtmlSource;
  contentWidth?: number;
  baseStyle?: React.CSSProperties;
  tagsStyles?: Record<string, Record<string, unknown>>;
  classesStyles?: Record<string, unknown>;
  systemFonts?: string[];
  renderers?: Record<string, unknown>;
  customHTMLElementModels?: Record<string, unknown>;
  defaultTextProps?: Record<string, unknown>;
  renderersProps?: Record<string, unknown>;
  ignoredDomTags?: string[];
}

/**
 * Convert React Native style object to CSS style object.
 * Handles numeric lineHeight (RN = pixels, CSS = unitless multiplier).
 */
function toCssStyle(rnStyle: Record<string, unknown>): React.CSSProperties {
  const css: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rnStyle)) {
    if (key === "lineHeight" && typeof value === "number") {
      css.lineHeight = `${value}px`;
    } else if (key === "textDecorationLine") {
      // CSS uses textDecorationLine too, but web shorthand is textDecoration
      css.textDecorationLine = value;
    } else {
      css[key] = value;
    }
  }
  return css as React.CSSProperties;
}

/** Convert a camelCase CSS property to kebab-case */
function toKebab(prop: string): string {
  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** Serialize a style object to a CSS declaration block */
function styleToCss(style: Record<string, unknown>): string {
  const cssStyle = toCssStyle(style);
  return Object.entries(cssStyle)
    .map(([k, v]) => `${toKebab(k)}: ${typeof v === "number" ? `${v}px` : v}`)
    .join("; ");
}

function RenderHtml({ source, baseStyle, tagsStyles }: RenderHtmlProps) {
  const html = source?.html ?? "";
  const scopeId = useId().replace(/:/g, "_");
  const scopeClass = `rhtml${scopeId}`;

  // Build scoped CSS rules from tagsStyles
  let scopedCss = "";
  if (tagsStyles) {
    const rules: string[] = [];
    for (const [tag, style] of Object.entries(tagsStyles)) {
      if (style && typeof style === "object") {
        rules.push(
          `.${scopeClass} ${tag} { ${styleToCss(style as Record<string, unknown>)} }`,
        );
      }
    }
    scopedCss = rules.join("\n");
  }

  const containerStyle = baseStyle
    ? toCssStyle(baseStyle as Record<string, unknown>)
    : undefined;

  return React.createElement(
    React.Fragment,
    null,
    scopedCss
      ? React.createElement("style", {
          dangerouslySetInnerHTML: { __html: scopedCss },
        })
      : null,
    React.createElement("div", {
      className: scopeClass,
      dangerouslySetInnerHTML: { __html: html },
      style: containerStyle,
    }),
  );
}

export default RenderHtml;

export class HTMLElementModel {
  static extend(_params?: Record<string, unknown>): HTMLElementModel {
    return new HTMLElementModel();
  }
}

export const HTMLContentModel = {
  block: "block",
  inline: "inline",
  mixed: "mixed",
  textual: "textual",
  none: "none",
} as const;
