/**
 * FlowForge API Base URL configuration.
 * In development: uses Vite's reverse proxy ('/api').
 * In production (e.g. Vercel): uses VITE_API_URL environment variable pointing to Render.
 */
export const API_BASE = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api';
