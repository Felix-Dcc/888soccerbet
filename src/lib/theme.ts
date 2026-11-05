/** Storage key for the player theme; "light" turns on white mode (dark is the default). */
export const THEME_KEY = "kb.theme";

/*
 * Inline <head> scripts, run before first paint so a reload never flashes the wrong theme. They
 * live in a plain module on purpose: a value exported from a "use client" file reaches a Server
 * Component as a client reference, not as the string itself.
 */
export const THEME_SCRIPT = `(function(){try{if(localStorage.getItem("${THEME_KEY}")==="light")document.documentElement.dataset.theme="light"}catch(e){}})();`;
export const ADMIN_THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("kb.admin.theme");if(t)document.documentElement.dataset.adminTheme=t}catch(e){}})();`;
