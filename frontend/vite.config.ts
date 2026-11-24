import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE lets the app live under a sub-path (e.g. GitHub Pages: /affiliate-platform/).
export default defineConfig({ base: process.env.VITE_BASE ?? '/', plugins: [react()] });
