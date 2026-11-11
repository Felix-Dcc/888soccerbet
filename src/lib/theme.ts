/** Storage key for the player theme: "dark", "light" or "system" (follow the device). White is the default. */
export const THEME_KEY = "kb.theme";
/** Fired on window whenever the applied theme changes, so every switch on the page stays in step. */
export const THEME_EVENT = "kb:theme";

/*
 * Inline <head> scripts, run before first paint so a reload never flashes the wrong theme. They
 * live in a plain module on purpose: a value exported from a "use client" file reaches a Server
 * Component as a client reference, not as the string itself.
 */
// Applies the saved choice; with "system" it follows the device and re-applies when the device switches.
// window.__bzTheme lets the switch re-apply after a change.
export const THEME_SCRIPT = `(function(){try{var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");function a(){var t=null;try{t=localStorage.getItem("${THEME_KEY}")}catch(e){}if(t==="dark"||(t==="system"&&m.matches))delete d.dataset.theme;else d.dataset.theme="light";window.dispatchEvent(new Event("${THEME_EVENT}"))}a();m.addEventListener("change",a);window.__bzTheme=a}catch(e){}})();`;
export const ADMIN_THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("kb.admin.theme");if(t)document.documentElement.dataset.adminTheme=t}catch(e){}})();`;
