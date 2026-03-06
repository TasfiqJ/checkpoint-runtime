/**
 * API base URL configuration.
 *
 * In Docker (nginx proxy):  VITE_API_URL is unset → API_BASE = "" → fetch("/api/...")
 * On Vercel (external CDN): VITE_API_URL = "https://api-checkpoint.tasfiqj.com" → fetch("https://api-checkpoint.tasfiqj.com/api/...")
 */
export const API_BASE: string = import.meta.env.VITE_API_URL ?? "";
