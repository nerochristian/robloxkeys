<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1emqIOmXJvQi3EmEj8PsZldmQjwOqc53F

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `VITE_GEMINI_API_KEY` in root `.env` (`../.env`) only if you want browser-side Gemini fallback
3. Update branding in `config/brandConfig.ts` (store name, logo URL, banner URL, emojis, links, storage prefix)
4. Configure bot bridge vars in root `.env` (`../.env`):
   `VITE_BOT_API_URL` (set to your API public URL, e.g. `https://robloxkeys.up.railway.app`),
   `VITE_BOT_API_PREFIX` (default `/api/bot`),
   `VITE_BOT_API_KEY`,
   optional `VITE_BOT_API_KEY_HEADER`, `VITE_BOT_API_AUTH_SCHEME`, `VITE_BOT_API_TIMEOUT_MS`
5. Configure shop API vars in root `.env` (`../.env`):
   `VITE_STORE_API_URL` (set to your API public URL),
   `VITE_STORE_API_PREFIX` (default `/shop`),
   optional `VITE_STORE_API_KEY`, `VITE_STORE_API_TIMEOUT_MS`
6. If you deploy frontend and backend as separate Railway services:
   use Railway private domain (`robloxkeys` / `robloxkeys.railway.internal`) only for server-to-server traffic.
   Browser `VITE_*` URLs must always use the backend public domain.
7. Run the app:
   `npm run dev`
