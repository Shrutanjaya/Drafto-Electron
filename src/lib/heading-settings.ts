import type { EnumStyle } from "@/lib/wp/wp-numbering";

export interface HeadingLevelStyle {
  bold: boolean;
  italics: boolean;
  underline: boolean;
  smallCaps: boolean;
  allCaps: boolean;
  numbering: EnumStyle | "none";
}

export interface HeadingSettings {
  h1: HeadingLevelStyle;
  h2: HeadingLevelStyle;
  h3: HeadingLevelStyle;
}

export const DEFAULT_HEADING_SETTINGS: HeadingSettings = {
  h1: {
    bold: true,
    italics: false,
    underline: false,
    smallCaps: false,
    allCaps: false,
    numbering: "upper-roman", // I, II, III
  },
  h2: {
    bold: false,
    italics: false,
    underline: false,
    smallCaps: true,
    allCaps: false,
    numbering: "upper-alpha", // A, B, C
  },
  h3: {
    bold: false,
    italics: true,
    underline: false,
    smallCaps: false,
    allCaps: false,
    numbering: "lower-roman", // i, ii, iii
  },
};

const HEADING_SETTINGS_KEY = "drafto_heading_settings";

export function getHeadingSettings(): HeadingSettings {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_HEADING_SETTINGS;
  }
  try {
    const raw = localStorage.getItem(HEADING_SETTINGS_KEY);
    if (!raw) return DEFAULT_HEADING_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      h1: { ...DEFAULT_HEADING_SETTINGS.h1, ...(parsed.h1 || {}) },
      h2: { ...DEFAULT_HEADING_SETTINGS.h2, ...(parsed.h2 || {}) },
      h3: { ...DEFAULT_HEADING_SETTINGS.h3, ...(parsed.h3 || {}) },
    };
  } catch {
    return DEFAULT_HEADING_SETTINGS;
  }
}

export function saveHeadingSettings(settings: HeadingSettings): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.setItem(HEADING_SETTINGS_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent("drafto-heading-settings-changed", { detail: settings }));
  } catch (err) {
    console.error("Failed to save heading settings", err);
  }
}
