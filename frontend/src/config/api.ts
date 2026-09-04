/**
 * API base URL configuration.
 *
 * In local Docker (nginx proxy): VITE_API_URL is unset → API_BASE = "" → fetch("/api/...")
 * In local Vite development: set VITE_API_URL to the loopback control-plane URL.
 * The hosted public routes do not load these operator-console API modules.
 */
export const API_BASE: string = import.meta.env.VITE_API_URL ?? "";
