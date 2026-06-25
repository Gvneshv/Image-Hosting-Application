/**
 * Dark / light theme toggle for the Image Hosting Application.
 *
 * HOW IT WORKS
 * ------------
 * 1. An inline <script> in each page's <head> reads localStorage and sets data-theme on <html> BEFORE the first CSS paint, preventing any flash.
 *    (That script is a 3-line copy; see the comment at the bottom of this file.)
 *
 * 2. This deferred script wires up the toggle button(s) on the page and keeps the button icon in sync with the active theme.
 *
 * STORAGE
 * -------
 * localStorage key: "theme"
 * Values           : "dark" | "light" | (absent = follow OS)
 *
 * BUTTON CONTRACT
 * ---------------
 * Any element with id="theme-toggle" on the page is treated as the toggle.
 * The button's inner HTML is swapped between the moon SVG (light mode active) and the sun SVG (dark mode active) to always show "switch TO this" intent.
 */

"use strict";

/* SVG icons - self-contained so no extra image files are needed.
   Moon = currently in light mode, click to go dark.
   Sun  = currently in dark mode, click to go light.         */
const MOON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
  xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
    stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const SUN_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
  xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="12" cy="12" r="5"
    stroke="currentColor" stroke-width="2"
    stroke-linecap="round"/>
  <line x1="12" y1="1"  x2="12" y2="3"  stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <line x1="4.22" y1="4.22"  x2="5.64" y2="5.64"  stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <line x1="1"  y1="12" x2="3"  y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

/**
 * Return true when the effective theme (explicit pin or OS fallback) is dark.
 * @returns {boolean}
 */
function isDark() {
  const pinned = document.documentElement.getAttribute("data-theme");
  if (pinned === "dark") return true;
  if (pinned === "light") return false;
  /* No pin - follow OS */
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Sync the toggle button icon to the current theme.
 * Shows moon when light (inviting you to go dark) and sun when dark (inviting you to go light).
 * @param {HTMLElement} btn
 */
function syncIcon(btn) {
  if (!btn) return;
  btn.innerHTML = isDark() ? SUN_SVG : MOON_SVG;
  btn.setAttribute(
    "aria-label",
    isDark() ? "Switch to light theme" : "Switch to dark theme",
  );
  btn.setAttribute("title", isDark() ? "Light theme" : "Dark theme");
}

/**
 * Apply a theme by setting data-theme on <html> and persisting the choice.
 * Passing null clears the pin and reverts to OS preference.
 * @param {"dark"|"light"|null} theme
 */
function applyTheme(theme) {
  if (theme === null) {
    document.documentElement.removeAttribute("data-theme");
    localStorage.removeItem("theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }
}

/** Toggle between dark and light, persisting the result. */
function toggleTheme() {
  applyTheme(isDark() ? "light" : "dark");
  /* Re-sync all toggle buttons on the page (there should only be one). */
  document.querySelectorAll("#theme-toggle").forEach(syncIcon);
}

/* Wire up once the DOM is ready. The script tag uses `defer`, so DOMContentLoaded has already fired by the time this runs - but guard anyway for safety.                                                     */
function init() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;

  syncIcon(btn);
  btn.addEventListener("click", toggleTheme);

  /* Keep the icon in sync if the OS preference changes while the page is open (e.g. the user switches system appearance without reloading).
  Only fires when there is no explicit pin.                                           */
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (!localStorage.getItem("theme")) {
        document.querySelectorAll("#theme-toggle").forEach(syncIcon);
      }
    });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

/*
 * INLINE HEAD SCRIPT (copy this verbatim into the <head> of every HTML page, BEFORE any <link rel="stylesheet"> tags):
 *
 *   <script>
 *     (function () {
 *       var t = localStorage.getItem("theme");
 *       if (t) document.documentElement.setAttribute("data-theme", t);
 *     })();
 *   </script>
 *
 * This runs synchronously before CSS is parsed, so the correct token values are in place from the very first paint.
 * Without it, users with a saved dark preference would see a white flash on every page load.
 */
