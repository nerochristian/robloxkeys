# DigitalOcean App Platform

This repo can be deployed to DigitalOcean App Platform as a single app with:

- one Python web service for the Discord bot + `/shop` API
- one static site for the Vite storefront

Use [app.example.yaml](/c:/Users/Dell/bananashop/deploy/digitalocean/app.example.yaml) as the starting spec.

## Recommended layout

- Backend component:
  - `source_dir: .`
  - `build_command: pip install -r requirements.txt`
  - `run_command: python main.py`
- Frontend component:
  - `source_dir: banana-store`
  - `build_command: npm ci && npm run build`
  - `output_dir: dist`
- Ingress:
  - route `/shop` and `/api/bot` to the backend
  - route `/` to the storefront

With that layout, the frontend can use relative API paths and you do not need `VITE_STORE_API_URL` or `VITE_BOT_API_URL`.

## Env changes from Railway

Update these values before deploy:

- `FRONTEND_ORIGIN`
- `FRONTEND_ORIGINS`
- `DISCORD_OAUTH_REDIRECT_URI`
- any other URL that still points to `*.up.railway.app`

For App Platform, `PORT` is injected automatically based on the service `http_port`. Keep the app listening on `process.env.PORT` / `os.getenv("PORT")`, which this repo already does.

## Deploy

1. Push the repo to GitHub or GitLab.
2. Create an App Platform app from the repo, or run `doctl apps create --spec deploy/digitalocean/app.example.yaml`.
3. Add all required secrets from your local `.env` in the App Platform UI.
4. Replace placeholder repo/branch/domain values in the app spec.
5. After the first deploy, update DNS for your custom domain and then update the CORS and OAuth env vars to the final domain.

## Important

The secrets in your local `.env` should be treated as compromised if they were ever committed, shared, or pasted into external tools. Rotate at least:

- `DISCORD_TOKEN`
- database credentials
- `SUPABASE_SECRET_KEY`
- `PAYPAL_CLIENT_SECRET`
- `OXAPAY_MERCHANT_API_KEY`
- `RESEND_API_KEY`
- `SMTP_PASS`
- `CF_TURNSTILE_SECRET_KEY`
