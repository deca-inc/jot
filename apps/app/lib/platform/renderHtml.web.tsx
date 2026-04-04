/**
 * Web shim for react-native-render-html
 *
 * Uses dangerouslySetInnerHTML to render HTML content on web.
 */

import React from "react";

interface RenderHtmlSource {
  html?: string;
  uri?: string;
}

interface RenderHtmlProps {
  source: RenderHtmlSource;
  contentWidth?: number;
  baseStyle?: React.CSSProperties;
  tagsStyles?: Record<string, unknown>;
  classesStyles?: Record<string, unknown>;
  systemFonts?: string[];
  renderers?: Record<string, unknown>;
  customHTMLElementModels?: Record<string, unknown>;
  defaultTextProps?: Record<string, unknown>;
  renderersProps?: Record<string, unknown>;
  ignoredDomTags?: string[];
}

function RenderHtml({ source, baseStyle }: RenderHtmlProps) {
  const html = source?.html ?? "";
  return React.createElement("div", {
    dangerouslySetInnerHTML: { __html: html },
    style: baseStyle,
  });
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
