import hmac
import asyncio
import html
import os
import re
import fnmatch
import json
import base64
import hashlib
import secrets
import smtplib
import ssl
import mimetypes
from email.message import EmailMessage
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Any, Optional
from collections import defaultdict
from urllib.parse import urlencode, urlparse, urlunparse, parse_qsl

import asyncpg
import discord
from aiohttp import ClientSession, ClientTimeout, web

from ..utils.logger import logger


class WebsiteBridgeServer:
    def __init__(self, bot: discord.Client):
        self.bot = bot
        self.host = os.getenv("BOT_API_HOST", "0.0.0.0")
        port_value = os.getenv("PORT") or os.getenv("BOT_API_PORT") or "8080"
        self.port = int(port_value)
        self.api_key = (os.getenv("BOT_API_KEY") or "").strip()
        self.api_key_header = (os.getenv("BOT_API_KEY_HEADER") or "x-api-key").strip().lower()
        self.api_auth_scheme = (os.getenv("BOT_API_AUTH_SCHEME") or "").strip().lower()
        raw_origins = (os.getenv("FRONTEND_ORIGINS") or os.getenv("FRONTEND_ORIGIN") or "http://localhost:3000").strip()
        self.allowed_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
        if not self.allowed_origins:
            self.allowed_origins = ["http://localhost:3000"]

        self.events_channel_id = self._env_int("WEBSITE_EVENTS_CHANNEL_ID")
        self.order_channel_id = self._env_int("WEBSITE_ORDER_CHANNEL_ID") or self.events_channel_id
        self.chat_channel_id = self._env_int("WEBSITE_CHAT_CHANNEL_ID") or self.events_channel_id
        self.admin_email = (os.getenv("ADMIN_EMAIL") or "powerpoki7@gmail.com").strip().lower()
        self.admin_password = (os.getenv("ADMIN_PASSWORD") or "").strip()
        self.admin_password_configured = bool(self.admin_password)
        if not self.admin_password_configured:
            logger.warning(
                "ADMIN_PASSWORD not set; existing admin password hash will be preserved."
                " Set ADMIN_PASSWORD to enforce/reset the admin credential."
            )
        self.login_2fa_enabled = self._env_bool("AUTH_2FA_ENABLED", default=False)
        self.login_otp_ttl_seconds = max(60, self._to_int(os.getenv("AUTH_2FA_TTL_SECONDS"), default=300) or 300)
        self.login_otp_max_attempts = max(1, self._to_int(os.getenv("AUTH_2FA_MAX_ATTEMPTS"), default=5) or 5)
        self.login_otp_min_interval_seconds = max(
            0, self._to_int(os.getenv("AUTH_2FA_MIN_INTERVAL_SECONDS"), default=30) or 30
        )
        self.login_otp_last_sent_at: dict[str, datetime] = {}
        self.auth_session_ttl_seconds = max(
            300, self._to_int(os.getenv("AUTH_SESSION_TTL_SECONDS"), default=86400) or 86400
        )
        self.auth_session_secret = (os.getenv("AUTH_SESSION_SECRET") or "").strip()
        if not self.auth_session_secret:
            self.auth_session_secret = secrets.token_urlsafe(48)
            logger.warning(
                "AUTH_SESSION_SECRET not set; using ephemeral in-memory secret."
                " Persistent sessions will be invalidated on restart. Set AUTH_SESSION_SECRET."
            )
        bootstrap_password = self.admin_password if self.admin_password_configured else secrets.token_urlsafe(24)
        self.bootstrap_admin_password_hash = self._hash_password(bootstrap_password)
        self.login_otp_sessions: dict[str, dict[str, Any]] = {}
        self.discord_link_required_on_login = self._env_bool("DISCORD_REQUIRE_LINK_ON_LOGIN", default=True)
        self.discord_link_token_ttl_seconds = max(
            120, self._to_int(os.getenv("DISCORD_LINK_TOKEN_TTL_SECONDS"), default=600) or 600
        )
        self.discord_oauth_state_ttl_seconds = max(
            120, self._to_int(os.getenv("DISCORD_OAUTH_STATE_TTL_SECONDS"), default=600) or 600
        )
        self.discord_oauth_client_id = (os.getenv("DISCORD_OAUTH_CLIENT_ID") or "").strip()
        self.discord_oauth_client_secret = (os.getenv("DISCORD_OAUTH_CLIENT_SECRET") or "").strip()
        self.discord_oauth_redirect_uri = (os.getenv("DISCORD_OAUTH_REDIRECT_URI") or "").strip()
        self.discord_auto_join_guild = self._env_bool("DISCORD_AUTO_JOIN_GUILD", default=True)
        self.discord_join_guild_id = (os.getenv("DISCORD_GUILD_ID") or "").strip()
        if self.discord_join_guild_id and not self.discord_join_guild_id.isdigit():
            self.discord_join_guild_id = ""
        self.discord_bot_token = (os.getenv("DISCORD_TOKEN") or "").strip()
        raw_discord_scopes = (os.getenv("DISCORD_OAUTH_SCOPES") or "identify email").strip() or "identify email"
        scope_parts = [part.strip() for part in raw_discord_scopes.replace(",", " ").split(" ") if part.strip()]
        normalized_scopes: list[str] = []
        for part in scope_parts:
            if part not in normalized_scopes:
                normalized_scopes.append(part)
        if "identify" not in normalized_scopes:
            normalized_scopes.append("identify")
        if (
            self.discord_auto_join_guild
            and self.discord_join_guild_id
            and "guilds.join" not in normalized_scopes
        ):
            normalized_scopes.append("guilds.join")
        self.discord_oauth_scopes = " ".join(normalized_scopes) if normalized_scopes else "identify email"
        self.discord_oauth_authorize_url = "https://discord.com/oauth2/authorize"
        self.discord_oauth_token_url = "https://discord.com/api/oauth2/token"
        self.discord_oauth_me_url = "https://discord.com/api/users/@me"
        self.discord_link_tokens: dict[str, dict[str, Any]] = {}
        self.discord_oauth_states: dict[str, dict[str, Any]] = {}

        self.smtp_host = (os.getenv("SMTP_HOST") or "").strip()
        self.smtp_port = self._to_int(os.getenv("SMTP_PORT"), default=587) or 587
        self.smtp_user = (os.getenv("SMTP_USER") or "").strip()
        self.smtp_password = (os.getenv("SMTP_PASS") or "").strip()
        self.smtp_from_email = (os.getenv("SMTP_FROM_EMAIL") or self.smtp_user or "").strip()
        self.smtp_from_name = (os.getenv("SMTP_FROM_NAME") or "Roblox Keys").strip()
        self.smtp_use_tls = self._env_bool("SMTP_USE_TLS", default=True)
        self.smtp_use_ssl = self._env_bool("SMTP_USE_SSL", default=False)
        self.resend_api_key = (os.getenv("RESEND_API_KEY") or "").strip()
        self.resend_api_url = (os.getenv("RESEND_API_URL") or "https://api.resend.com/emails").strip()
        self.resend_from_email = (os.getenv("RESEND_FROM_EMAIL") or self.smtp_from_email).strip()
        self.resend_from_name = (os.getenv("RESEND_FROM_NAME") or self.smtp_from_name or "Roblox Keys").strip()
        self.resend_reply_to = (os.getenv("RESEND_REPLY_TO") or "").strip()
        self.email_provider = (os.getenv("EMAIL_PROVIDER") or "auto").strip().lower()
        if self.email_provider not in {"auto", "smtp", "resend"}:
            self.email_provider = "auto"
        self.db_url = (os.getenv("SUPABASE_DATABASE_URL") or os.getenv("DATABASE_URL") or "").strip()
        self.shop_storage_backend = (os.getenv("SHOP_STORAGE_BACKEND") or "auto").strip().lower()
        if self.shop_storage_backend not in {"auto", "supabase", "json"}:
            self.shop_storage_backend = "auto"
        self.require_supabase_storage = (
            self.shop_storage_backend == "supabase"
            or str(os.getenv("SHOP_REQUIRE_SUPABASE", "false")).strip().lower() in {"1", "true", "yes", "on"}
        )
        self.shop_kv_table = (os.getenv("SHOP_KV_TABLE") or "shop_kv").strip()
        if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", self.shop_kv_table):
            self.shop_kv_table = "shop_kv"
        self.use_supabase_storage = self.require_supabase_storage or (
            self.shop_storage_backend == "auto" and bool(self.db_url)
        )
        self.pg_pool: Optional[asyncpg.Pool] = None
        self.data_dir = Path(os.getenv("SHOP_DATA_DIR", "data"))
        self.products_file = self.data_dir / "shop_products.json"
        self.orders_file = self.data_dir / "shop_orders.json"
        self.pending_payments_file = self.data_dir / "shop_pending_payments.json"
        self.media_library_file = self.data_dir / "shop_media_library.json"
        self.image_upload_max_bytes = max(
            64 * 1024,
            self._to_int(os.getenv("SHOP_IMAGE_UPLOAD_MAX_BYTES"), default=2 * 1024 * 1024) or (2 * 1024 * 1024),
        )
        self.image_upload_max_entries = max(
            1,
            self._to_int(os.getenv("SHOP_IMAGE_UPLOAD_MAX_ENTRIES"), default=250) or 250,
        )
        self.brand_logo_url = (os.getenv("BRAND_LOGO_URL") or "").strip()
        self.brand_banner_url = (os.getenv("BRAND_BANNER_URL") or "").strip()
        self.brand_favicon_url = (os.getenv("BRAND_FAVICON_URL") or "").strip()
        self.state_keys = (
            "settings",
            "users",
            "logs",
            "categories",
            "groups",
            "coupons",
            "invoices",
            "tickets",
            "feedbacks",
            "domains",
            "team",
            "blacklist",
            "payment_methods",
        )
        self.stripe_secret_key = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
        self.stripe_currency = (os.getenv("STRIPE_CURRENCY") or "usd").strip().lower() or "usd"
        self.paypal_client_id = (os.getenv("PAYPAL_CLIENT_ID") or "").strip()
        self.paypal_client_secret = (os.getenv("PAYPAL_CLIENT_SECRET") or "").strip()
        self.paypal_api_base = (os.getenv("PAYPAL_API_BASE") or "https://api-m.paypal.com").strip().rstrip("/")
        self.paypal_checkout_url = (os.getenv("PAYPAL_CHECKOUT_URL") or "").strip()
        self._paypal_access_token: str = ""
        self._paypal_token_expires_at: float = 0.0
        self.crypto_checkout_url = (os.getenv("CRYPTO_CHECKOUT_URL") or "").strip()
        self.oxapay_merchant_api_key = (os.getenv("OXAPAY_MERCHANT_API_KEY") or "").strip()
        self.oxapay_api_url = (os.getenv("OXAPAY_API_URL") or "https://api.oxapay.com").strip().rstrip("/")
        self.oxapay_currency = (os.getenv("OXAPAY_CURRENCY") or "USD").strip().upper() or "USD"
        self.oxapay_lifetime_minutes = self._to_int(os.getenv("OXAPAY_LIFETIME_MINUTES"), default=60) or 60
        self.oxapay_min_amount = self._to_float(os.getenv("OXAPAY_MIN_AMOUNT"), default=0.10) or 0.10
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._ensure_json_file(self.products_file, [])
        self._ensure_json_file(self.orders_file, [])
        self._ensure_json_file(self.pending_payments_file, {})
        self._ensure_json_file(self.media_library_file, [])

        # --- Rate Limiting ---
        self._rate_limit_auth = max(1, self._to_int(os.getenv("RATE_LIMIT_AUTH_PER_MIN"), default=5) or 5)
        self._rate_limit_payment = max(1, self._to_int(os.getenv("RATE_LIMIT_PAYMENT_PER_MIN"), default=10) or 10)
        self._rate_limit_general = max(1, self._to_int(os.getenv("RATE_LIMIT_GENERAL_PER_MIN"), default=60) or 60)
        self._rate_buckets: dict[str, list[float]] = defaultdict(list)
        self._rate_purge_counter = 0

        # --- Response Cache ---
        self._cache: dict[str, tuple[Any, float]] = {}
        self._cache_ttl = {
            "products": 15.0,
            "health": 30.0,
            "payment_methods": 60.0,
        }

        # --- Cloudflare Turnstile ---
        self.cf_turnstile_site_key = (os.getenv("CF_TURNSTILE_SITE_KEY") or "").strip()
        self.cf_turnstile_secret_key = (os.getenv("CF_TURNSTILE_SECRET_KEY") or "").strip()

        self.app = web.Application(
            middlewares=[
                self._error_middleware,
                self._security_headers_middleware,
                self._rate_limit_middleware,
                self._cors_middleware,
                self._auth_middleware,
            ]
        )
        self.app.router.add_route("OPTIONS", "/{tail:.*}", self._handle_options)
        self.app.router.add_get("/api/bot/health", self.health)
        self.app.router.add_post("/api/bot/chat", self.chat)
        self.app.router.add_post("/api/bot/order", self.order)
        self.app.router.add_get("/shop/health", self.shop_health)
        self.app.router.add_post("/shop/chat", self.chat)
        self.app.router.add_get("/shop/products", self.shop_products)
        self.app.router.add_get("/shop/products/{product_id}", self.shop_get_product)
        self.app.router.add_get("/shop/media/{asset_id}", self.shop_get_media)
        self.app.router.add_get("/shop/invoices/{invoice_id}", self.shop_get_invoice)
        self.app.router.add_get("/shop/orders", self.shop_orders)
        self.app.router.add_get("/shop/analytics", self.shop_analytics)
        self.app.router.add_post("/shop/licenses/validate", self.shop_validate_license)
        self.app.router.add_get("/shop/coupons", self.shop_get_coupons)
        self.app.router.add_post("/shop/coupons", self.shop_create_coupon)
        self.app.router.add_get("/shop/state/{state_key}", self.shop_get_state)
        self.app.router.add_put("/shop/state/{state_key}", self.shop_set_state)
        self.app.router.add_get("/shop/payment-methods", self.shop_payment_methods)
        self.app.router.add_get("/shop/admin/summary", self.shop_admin_summary)
        self.app.router.add_post("/shop/auth/login", self.shop_auth_login)
        self.app.router.add_post("/shop/auth/verify-otp", self.shop_auth_verify_otp)
        self.app.router.add_post("/shop/auth/register", self.shop_auth_register)
        self.app.router.add_post("/shop/auth/discord/link-token", self.shop_auth_discord_link_token)
        self.app.router.add_post("/shop/auth/discord/connect-url", self.shop_auth_discord_connect_url)
        self.app.router.add_get("/shop/auth/discord/callback", self.shop_auth_discord_callback)
        self.app.router.add_post("/shop/auth/discord/unlink", self.shop_auth_discord_unlink)
        self.app.router.add_post("/shop/products", self.shop_upsert_product)
        self.app.router.add_delete("/shop/products/{product_id}", self.shop_delete_product)
        self.app.router.add_get("/shop/inventory/{product_id}", self.shop_get_inventory)
        self.app.router.add_post("/shop/inventory/add", self.shop_add_inventory)
        self.app.router.add_post("/shop/stock", self.shop_update_stock)
        self.app.router.add_post("/shop/media/upload", self.shop_upload_media)
        self.app.router.add_post("/shop/payments/create", self.shop_create_payment)
        self.app.router.add_post("/shop/payments/confirm", self.shop_confirm_payment)
        self.app.router.add_post("/shop/buy", self.shop_buy)
        self.app.router.add_post("/shop/orders/{order_id}/status", self.shop_update_order_status)

        self.runner: Optional[web.AppRunner] = None

    @web.middleware
    async def _error_middleware(self, request: web.Request, handler):
        try:
            return await handler(request)
        except web.HTTPException:
            raise
        except Exception as exc:
            logger.exception(f"Website bridge error on {request.path}: {exc}")
            return web.json_response(
                {"ok": False, "message": "internal server error"},
                status=500,
            )

    @web.middleware
    async def _security_headers_middleware(self, request: web.Request, handler):
        response = await handler(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://cdn.tailwindcss.com https://esm.sh; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob: https:; "
            "connect-src 'self' https:; "
            "frame-src https://challenges.cloudflare.com; "
            "object-src 'none'; "
            "base-uri 'self'"
        )
        return response

    def _get_client_ip(self, request: web.Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
        cf_ip = request.headers.get("CF-Connecting-IP", "")
        if cf_ip:
            return cf_ip.strip()
        peername = request.transport.get_extra_info("peername") if request.transport else None
        if peername:
            return str(peername[0])
        return "unknown"

    def _check_rate_limit(self, ip: str, limit: int) -> tuple[bool, int]:
        now = datetime.now(timezone.utc).timestamp()
        window_start = now - 60.0
        bucket_key = f"{ip}:{limit}"
        timestamps = self._rate_buckets[bucket_key]
        self._rate_buckets[bucket_key] = [t for t in timestamps if t > window_start]
        current = len(self._rate_buckets[bucket_key])
        if current >= limit:
            oldest = min(self._rate_buckets[bucket_key]) if self._rate_buckets[bucket_key] else now
            retry_after = max(1, int(oldest + 60.0 - now))
            return False, retry_after
        self._rate_buckets[bucket_key].append(now)
        self._rate_purge_counter += 1
        if self._rate_purge_counter >= 100:
            self._rate_purge_counter = 0
            self._purge_stale_rate_buckets()
        return True, 0

    def _purge_stale_rate_buckets(self) -> None:
        now = datetime.now(timezone.utc).timestamp()
        window_start = now - 120.0
        stale_keys = [k for k, v in self._rate_buckets.items() if not v or max(v) < window_start]
        for k in stale_keys:
            del self._rate_buckets[k]

    @web.middleware
    async def _rate_limit_middleware(self, request: web.Request, handler):
        # Rate limiting intentionally disabled.
        return await handler(request)

    async def _verify_turnstile(self, request: web.Request) -> bool:
        if not self.cf_turnstile_secret_key:
            return True
        token = request.headers.get("cf-turnstile-response", "").strip()
        if not token:
            return True
        ip = self._get_client_ip(request)
        try:
            async with ClientSession() as session:
                async with session.post(
                    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                    data={
                        "secret": self.cf_turnstile_secret_key,
                        "response": token,
                        "remoteip": ip,
                    },
                    timeout=ClientTimeout(total=5),
                ) as resp:
                    result = await resp.json(content_type=None)
                    return bool(result.get("success"))
        except Exception as exc:
            logger.warning(f"Turnstile verification failed for {ip}: {exc}")
            return True
    @web.middleware
    async def _cors_middleware(self, request: web.Request, handler):
        response = await handler(request)
        self._apply_cors_headers(request, response)
        return response

    @web.middleware
    async def _auth_middleware(self, request: web.Request, handler):
        if request.method == "OPTIONS":
            return await handler(request)

        path = request.path

        if path.startswith("/api/bot"):
            if path == "/api/bot/health":
                return await handler(request)
            if not self._has_valid_api_key(request):
                return web.json_response({"ok": False, "message": "unauthorized"}, status=401)
            return await handler(request)

        if not path.startswith("/shop"):
            return await handler(request)

        if self._is_shop_public_request(request):
            return await handler(request)

        shop_user = self._parse_shop_session_from_request(request)
        if not isinstance(shop_user, dict):
            return web.json_response({"ok": False, "message": "unauthorized"}, status=401)

        request["shop_user"] = shop_user
        if self._is_shop_admin_request(request):
            role = str(shop_user.get("role") or "").strip().lower()
            if role != "admin":
                return web.json_response({"ok": False, "message": "forbidden"}, status=403)
        return await handler(request)

    def _has_valid_api_key(self, request: web.Request) -> bool:
        if not self.api_key:
            return True

        received_key = request.headers.get(self.api_key_header, "").strip()
        if self.api_auth_scheme and received_key.lower().startswith(f"{self.api_auth_scheme} "):
            received_key = received_key[len(self.api_auth_scheme) + 1 :].strip()

        auth_header = request.headers.get("authorization", "").strip()
        if not received_key and self.api_auth_scheme and auth_header.lower().startswith(f"{self.api_auth_scheme} "):
            received_key = auth_header[len(self.api_auth_scheme) + 1 :].strip()
        elif not received_key and auth_header.lower().startswith("bearer "):
            received_key = auth_header[7:].strip()

        if not received_key:
            return False
        return hmac.compare_digest(received_key, self.api_key)

    def _is_shop_public_request(self, request: web.Request) -> bool:
        path = request.path
        if path in {
            "/shop/health",
            "/shop/auth/login",
            "/shop/auth/verify-otp",
            "/shop/auth/register",
            "/shop/auth/discord/callback",
        }:
            return True
        if request.method == "GET" and (
            path == "/shop/products"
            or path.startswith("/shop/products/")
            or path.startswith("/shop/media/")
            or path == "/shop/payment-methods"
        ):
            return True
        if request.method == "POST" and path == "/shop/licenses/validate":
            return True
        if request.method == "POST" and path == "/shop/chat":
            return True
        return False

    def _is_shop_admin_request(self, request: web.Request) -> bool:
        path = request.path
        method = request.method.upper()
        if path.startswith("/shop/admin/"):
            return True
        if path == "/shop/analytics":
            return True
        if path.startswith("/shop/state/"):
            return True
        if path == "/shop/coupons":
            return True
        if path == "/shop/products" and method == "POST":
            return True
        if path.startswith("/shop/products/") and method == "DELETE":
            return True
        if path.startswith("/shop/inventory/"):
            return True
        if path == "/shop/inventory/add":
            return True
        if path == "/shop/stock":
            return True
        if path == "/shop/media/upload":
            return True
        if path.startswith("/shop/orders/") and method == "POST":
            return True
        return False

    @staticmethod
    def _b64url_encode(raw: bytes) -> str:
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    @staticmethod
    def _b64url_decode(value: str) -> Optional[bytes]:
        clean = str(value or "").strip()
        if not clean:
            return None
        padding = "=" * (-len(clean) % 4)
        try:
            return base64.urlsafe_b64decode(clean + padding)
        except Exception:
            return None

    def _extract_bearer_token(self, request: web.Request) -> str:
        auth_header = request.headers.get("authorization", "").strip()
        if auth_header.lower().startswith("bearer "):
            return auth_header[7:].strip()
        return ""

    def _sign_session_payload(self, payload_b64: str) -> str:
        digest = hmac.new(
            self.auth_session_secret.encode("utf-8"),
            payload_b64.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        return self._b64url_encode(digest)

    def _issue_shop_session_token(self, user: dict[str, Any]) -> str:
        now = int(datetime.now(timezone.utc).timestamp())
        payload = {
            "uid": str(user.get("id") or "").strip(),
            "email": str(user.get("email") or "").strip().lower(),
            "role": "admin" if str(user.get("role") or "").strip().lower() == "admin" else "user",
            "iat": now,
            "exp": now + self.auth_session_ttl_seconds,
        }
        payload_b64 = self._b64url_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
        signature = self._sign_session_payload(payload_b64)
        return f"{payload_b64}.{signature}"

    def _parse_shop_session_token(self, token: str) -> Optional[dict[str, Any]]:
        raw_token = str(token or "").strip()
        if "." not in raw_token:
            return None
        payload_b64, signature = raw_token.split(".", 1)
        expected_signature = self._sign_session_payload(payload_b64)
        if not signature or not hmac.compare_digest(signature, expected_signature):
            return None
        payload_raw = self._b64url_decode(payload_b64)
        if payload_raw is None:
            return None
        try:
            payload = json.loads(payload_raw.decode("utf-8"))
        except Exception:
            return None
        if not isinstance(payload, dict):
            return None
        uid = str(payload.get("uid") or "").strip()
        email = str(payload.get("email") or "").strip().lower()
        role = "admin" if str(payload.get("role") or "").strip().lower() == "admin" else "user"
        exp = self._to_int(payload.get("exp"), default=0) or 0
        now = int(datetime.now(timezone.utc).timestamp())
        if not uid or not email or exp <= now:
            return None
        return {"id": uid, "email": email, "role": role}

    def _parse_shop_session_from_request(self, request: web.Request) -> Optional[dict[str, Any]]:
        token = self._extract_bearer_token(request)
        if not token:
            return None
        return self._parse_shop_session_token(token)

    @staticmethod
    def _shop_user_from_request(request: web.Request) -> Optional[dict[str, Any]]:
        user = request.get("shop_user")
        if isinstance(user, dict):
            return user
        return None

    async def _get_public_user_by_identity(self, user_id: str, email: str) -> Optional[dict[str, Any]]:
        users = await self._load_state("users")
        if not isinstance(users, list):
            users = []
        users = self._ensure_default_admin_user([item for item in users if isinstance(item, dict)])
        normalized_user_id = str(user_id or "").strip()
        normalized_email = str(email or "").strip().lower()
        for user in users:
            row_user_id = str(user.get("id") or "").strip()
            row_email = str(user.get("email") or "").strip().lower()
            if row_user_id != normalized_user_id or row_email != normalized_email:
                continue
            public_user = dict(user)
            public_user.pop("password", None)
            return public_user
        return None

    async def _handle_options(self, request: web.Request):
        return web.Response(status=204)

    def _apply_cors_headers(self, request: web.Request, response: web.StreamResponse) -> None:
        origin = request.headers.get("Origin")

        if "*" in self.allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = "*"
        elif origin and self._is_origin_allowed(origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
        else:
            response.headers["Access-Control-Allow-Origin"] = self.allowed_origins[0]

        response.headers["Access-Control-Allow-Methods"] = "GET,POST,DELETE,PUT,PATCH,OPTIONS"
        request_headers = request.headers.get("Access-Control-Request-Headers")
        default_headers = f"Content-Type,Authorization,x-api-key,{self.api_key_header}"
        response.headers["Access-Control-Allow-Headers"] = request_headers or default_headers

    def _is_origin_allowed(self, origin: str) -> bool:
        for allowed in self.allowed_origins:
            if allowed == origin:
                return True
            if "*" in allowed and fnmatch.fnmatch(origin, allowed):
                return True
        return False

    async def start(self) -> None:
        if self.runner is not None:
            return

        if self.use_supabase_storage:
            try:
                await self._init_supabase_storage()
            except Exception as exc:
                if self.require_supabase_storage:
                    logger.critical(f"Supabase shop storage init failed in required mode: {exc}")
                    raise
                logger.error(f"Supabase shop storage init failed, falling back to JSON files: {exc}")
                self.use_supabase_storage = False

        self.runner = web.AppRunner(self.app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, self.host, self.port)
        await site.start()

        storage_mode = "supabase" if self.use_supabase_storage else "json"
        logger.info(f"Website bridge listening on {self.host}:{self.port} (shop storage: {storage_mode})")

    async def stop(self) -> None:
        if self.runner is None:
            return

        await self.runner.cleanup()
        self.runner = None
        if self.pg_pool is not None:
            await self.pg_pool.close()
            self.pg_pool = None
        logger.info("Website bridge stopped.")

    async def health(self, request: web.Request):
        return web.json_response(
            {
                "ok": True,
                "guilds": len(self.bot.guilds),
                "order_channel_configured": bool(self.order_channel_id),
                "chat_channel_configured": bool(self.chat_channel_id),
                "allowed_origins": self.allowed_origins,
            }
        )

    def _get_cache(self, key: str) -> Any:
        entry = self._cache.get(key)
        if entry is None:
            return None
        value, expiry = entry
        if datetime.now(timezone.utc).timestamp() > expiry:
            self._cache.pop(key, None)
            return None
        return value

    def _set_cache(self, key: str, value: Any) -> None:
        ttl = self._cache_ttl.get(key, 30.0)
        self._cache[key] = (value, datetime.now(timezone.utc).timestamp() + ttl)

    def _invalidate_cache(self, *keys: str) -> None:
        for key in keys:
            self._cache.pop(key, None)

    async def shop_health(self, request: web.Request):
        cached = self._get_cache("health")
        if cached is not None:
            return web.json_response(cached)
        products = await self._load_products()
        orders = await self._load_orders()
        pending = await self._load_pending_payments()
        settings = await self._load_state("settings")
        branding = self._extract_branding_from_settings(settings if isinstance(settings, dict) else {})
        result = {
                "ok": True,
                "products": len(products),
                "orders": len(orders),
                "pendingPayments": len(pending),
                "stripeEnabled": bool(self.stripe_secret_key),
                "oxapayEnabled": bool(self.oxapay_merchant_api_key),
                "storageBackend": "supabase" if self.use_supabase_storage else "json",
                "data_dir": str(self.data_dir),
                "branding": branding,
        }
        self._set_cache("health", result)
        return web.json_response(result)

    async def shop_products(self, request: web.Request):
        cached = self._get_cache("products")
        if cached is not None:
            return web.json_response(cached)
        products = [self._public_product(product) for product in await self._load_products()]
        result = {"ok": True, "products": products}
        self._set_cache("products", result)
        return web.json_response(result)

    async def shop_get_product(self, request: web.Request):
        product_id = str(request.match_info.get("product_id", "")).strip()
        if not product_id:
            return web.json_response({"ok": False, "message": "product id is required"}, status=400)

        product_id_lower = product_id.lower()
        products = await self._load_products()
        for product in products:
            if not isinstance(product, dict):
                continue
            row_id = str(product.get("id", "")).strip()
            row_path = str(product.get("urlPath", "")).strip().lower()
            if row_id == product_id or row_id.lower() == product_id_lower or (row_path and row_path == product_id_lower):
                public_product = self._public_product(product)
                return web.json_response({"ok": True, "product": public_product, "data": public_product})

        return web.json_response({"ok": False, "message": "product not found"}, status=404)

    async def shop_get_invoice(self, request: web.Request):
        auth_user = self._shop_user_from_request(request)
        if not isinstance(auth_user, dict):
            return web.json_response({"ok": False, "message": "unauthorized"}, status=401)
        is_admin = str(auth_user.get("role") or "").strip().lower() == "admin"
        auth_user_id = str(auth_user.get("id") or "").strip()
        auth_user_email = str(auth_user.get("email") or "").strip().lower()

        invoice_id = str(request.match_info.get("invoice_id", "")).strip()
        if not invoice_id:
            return web.json_response({"ok": False, "message": "invoice id is required"}, status=400)

        orders = await self._load_orders()
        for order in orders:
            if str(order.get("id", "")).strip() == invoice_id:
                if not is_admin:
                    user_payload = order.get("user")
                    user_data = user_payload if isinstance(user_payload, dict) else {}
                    row_user_id = str(order.get("userId") or "").strip()
                    row_email = str(user_data.get("email") or "").strip().lower()
                    matches_user_id = bool(auth_user_id and row_user_id == auth_user_id)
                    matches_user_email = bool(auth_user_email and row_email == auth_user_email)
                    if not matches_user_id and not matches_user_email:
                        return web.json_response({"ok": False, "message": "forbidden"}, status=403)
                return web.json_response({"ok": True, "invoice": order, "data": order})
        return web.json_response({"ok": False, "message": "invoice not found"}, status=404)

    async def shop_get_media(self, request: web.Request):
        asset_id = str(request.match_info.get("asset_id", "")).strip()
        if not asset_id:
            return web.json_response({"ok": False, "message": "asset id is required"}, status=400)

        library = await self._load_media_library()
        target = next((row for row in library if str(row.get("id", "")).strip() == asset_id), None)
        if not isinstance(target, dict):
            return web.json_response({"ok": False, "message": "media not found"}, status=404)

        mime_type = str(target.get("mimeType", "")).strip().lower() or "application/octet-stream"
        filename = str(target.get("filename", "")).strip() or f"{asset_id}.bin"
        raw: Optional[bytes] = None

        encoded = str(target.get("dataBase64", "")).strip()
        if encoded:
            try:
                raw = base64.b64decode(encoded, validate=False)
            except Exception:
                raw = None
        else:
            # Backward compatibility with old entries that stored full data URLs.
            data_url = str(target.get("dataUrl", "")).strip()
            if data_url.startswith("data:") and ";base64," in data_url:
                header, b64 = data_url.split(",", 1)
                if header.startswith("data:"):
                    candidate_mime = header[len("data:") :].split(";", 1)[0].strip().lower()
                    if candidate_mime:
                        mime_type = candidate_mime
                try:
                    raw = base64.b64decode(b64, validate=False)
                except Exception:
                    raw = None

        if not raw:
            return web.json_response({"ok": False, "message": "media payload is invalid"}, status=422)

        headers = {
            "Cache-Control": "public, max-age=31536000, immutable",
            "Content-Disposition": f'inline; filename="{filename}"',
        }
        return web.Response(body=raw, content_type=mime_type, headers=headers)

    async def shop_orders(self, request: web.Request):
        auth_user = self._shop_user_from_request(request)
        if not isinstance(auth_user, dict):
            return web.json_response({"ok": False, "message": "unauthorized"}, status=401)

        is_admin = str(auth_user.get("role") or "").strip().lower() == "admin"
        query_user_id = str(request.query.get("userId", "")).strip()
        query_user_email = str(request.query.get("userEmail", "")).strip().lower()
        auth_user_id = str(auth_user.get("id") or "").strip()
        auth_user_email = str(auth_user.get("email") or "").strip().lower()
        status_filter = str(request.query.get("status", "")).strip().lower()

        orders = await self._load_orders()
        rows: list[dict[str, Any]] = []
        for order in orders:
            if not isinstance(order, dict):
                continue
            row_status = str(order.get("status") or "pending").strip().lower()
            if status_filter and row_status != status_filter:
                continue

            user_payload = order.get("user")
            user_data = user_payload if isinstance(user_payload, dict) else {}
            row_user_id = str(order.get("userId") or "").strip()
            row_email = str(user_data.get("email") or "").strip().lower()

            if is_admin:
                if query_user_id and row_user_id != query_user_id:
                    continue
                if query_user_email and row_email != query_user_email:
                    continue
            else:
                matches_user_id = bool(auth_user_id and row_user_id == auth_user_id)
                matches_user_email = bool(auth_user_email and row_email == auth_user_email)
                if not matches_user_id and not matches_user_email:
                    continue

            rows.append(order)

        rows.sort(key=lambda row: str(row.get("createdAt") or ""), reverse=True)
        return web.json_response({"ok": True, "orders": rows})

    async def shop_get_state(self, request: web.Request):
        state_key = str(request.match_info.get("state_key", "")).strip().lower()
        if not self._is_state_key_allowed(state_key):
            return web.json_response({"ok": False, "message": "invalid state key"}, status=400)
        state_value = await self._load_state(state_key)
        if state_key == "users" and isinstance(state_value, list):
            safe_users: list[dict[str, Any]] = []
            for user in state_value:
                if not isinstance(user, dict):
                    continue
                public_user = dict(user)
                public_user.pop("password", None)
                safe_users.append(public_user)
            state_value = safe_users
        return web.json_response({"ok": True, "state": state_value})

    async def shop_set_state(self, request: web.Request):
        state_key = str(request.match_info.get("state_key", "")).strip().lower()
        if not self._is_state_key_allowed(state_key):
            return web.json_response({"ok": False, "message": "invalid state key"}, status=400)
        payload = await self._safe_json(request)
        if payload is None:
            return web.json_response({"ok": False, "message": "invalid json body"}, status=400)
        if "state" not in payload:
            return web.json_response({"ok": False, "message": "state payload is required"}, status=400)

        expected = self._default_state_value(state_key)
        state_value = payload.get("state")
        if isinstance(expected, list) and not isinstance(state_value, list):
            return web.json_response({"ok": False, "message": "state must be an array"}, status=400)
        if isinstance(expected, dict) and not isinstance(state_value, dict):
            return web.json_response({"ok": False, "message": "state must be an object"}, status=400)

        # Keep admin access resilient even if users list is overwritten.
        if state_key == "users" and isinstance(state_value, list):
            users = [item for item in state_value if isinstance(item, dict)]
            users = self._ensure_default_admin_user(users)
            await self._save_state(state_key, users)
            return web.json_response({"ok": True, "state": users})

        await self._save_state(state_key, state_value)
        if state_key in {"settings", "payment_methods"}:
            self._invalidate_cache("payment_methods", "health")
        return web.json_response({"ok": True, "state": state_value})

    async def shop_auth_login(self, request: web.Request):
        if not await self._verify_turnstile(request):
            return web.json_response({"ok": False, "message": "bot verification failed"}, status=403)
        payload = await self._safe_json(request)
        if payload is None:
            return web.json_response({"ok": False, "message": "invalid json body"}, status=400)
        email = str(payload.get("email", "")).strip().lower()
        password = str(payload.get("password", "")).strip()
        if not email or not password:
            return web.json_response({"ok": False, "message": "email and password are required"}, status=400)

        users = await self._load_state("users")
        if not isinstance(users, list):
            users = []
        users = self._ensure_default_admin_user([item for item in users if isinstance(item, dict)])

        for user in users:
            if str(user.get("email", "")).strip().lower() != email:
                continue
            if not self._verify_password(password, str(user.get("password", "")).strip()):
                continue
            if self._is_login_2fa_ready():
                if self.login_otp_min_interval_seconds > 0:
                    now = datetime.now(timezone.utc)
                    last_sent_at = self.login_otp_last_sent_at.get(email)
                    if isinstance(last_sent_at, datetime):
                        if last_sent_at.tzinfo is None:
                            last_sent_at = last_sent_at.replace(tzinfo=timezone.utc)
                        elapsed = (now - last_sent_at).total_seconds()
                        if elapsed < self.login_otp_min_interval_seconds:
                            retry_after = max(1, int(self.login_otp_min_interval_seconds - elapsed))
                            return web.json_response(
                                {
                                    "ok": False,
                                    "message": "please wait before requesting another verification code",
                                    "retryAfterSeconds": retry_after,
                                },
                                status=429,
                            )
                otp_token = secrets.token_urlsafe(24)
                otp_code = f"{secrets.randbelow(1_000_000):06d}"
                self.login_otp_sessions[otp_token] = {
                    "email": email,
                    "code": otp_code,
                    "expiresAt": (datetime.now(timezone.utc) + timedelta(seconds=self.login_otp_ttl_seconds)).isoformat(),
                    "attempts": 0,
                }
                self._purge_expired_login_otps()
                sent = await self._send_login_otp_email(email, otp_code)
                if not sent:
                    self.login_otp_sessions.pop(otp_token, None)
                    await self._append_security_log(f"2FA OTP delivery failed for: {email}", "WARNING")
                    return web.json_response({"ok": False, "message": "failed to send OTP email"}, status=502)
                self.login_otp_last_sent_at[email] = datetime.now(timezone.utc)
                await self._append_security_log(f"2FA OTP issued for: {email}", "SUCCESS")
                return web.json_response(
                    {
                        "ok": True,
                        "requires2fa": True,
                        "otpToken": otp_token,
                        "message": f"A verification code was sent to {email}",
                        "expiresInSeconds": self.login_otp_ttl_seconds,
                    }
                )

            public_user = dict(user)
            public_user.pop("password", None)
            discord_link_token = self._issue_discord_link_token(public_user)
            has_discord_link = bool(str(public_user.get("discordId") or "").strip())
            requires_discord = bool(self.discord_link_required_on_login and self._is_discord_oauth_ready() and not has_discord_link)
            session_token = self._issue_shop_session_token(public_user)
            await self._append_security_log(f"User Authentication Successful: {email}", "SUCCESS")
            return web.json_response(
                {
                    "ok": True,
                    "user": public_user,
                    "sessionToken": session_token,
                    "discordLinkToken": discord_link_token,
                    "requiresDiscord": requires_discord,
                    "message": "Connect Discord to continue" if requires_discord else "",
                }
            )

        await self._append_security_log(f"Failed Login Attempt: {email}", "CRITICAL")
        return web.json_response({"ok": False, "message": "invalid email or password"}, status=401)

    async def shop_auth_verify_otp(self, request: web.Request):
        payload = await self._safe_json(request)
        if payload is None:
            return web.json_response({"ok": False, "message": "invalid json body"}, status=400)

        otp_token = str(payload.get("otpToken", "")).strip()
        otp_code = str(payload.get("code", "")).strip()
        if not otp_token or not otp_code:
            return web.json_response({"ok": False, "message": "otp token and code are required"}, status=400)

        self._purge_expired_login_otps()
        entry = self.login_otp_sessions.get(otp_token)
        if not isinstance(entry, dict):
            return web.json_response({"ok": False, "message": "otp expired or invalid"}, status=401)

        email = str(entry.get("email", "")).strip().lower()
        expected_code = str(entry.get("code", "")).strip()
        attempts = self._to_int(entry.get("attempts"), default=0) or 0

        if otp_code != expected_code:
            attempts += 1
            entry["attempts"] = attempts
            if attempts >= self.login_otp_max_attempts:
                self.login_otp_sessions.pop(otp_token, None)
            await self._append_security_log(f"2FA OTP verification failed for: {email}", "CRITICAL")
            return web.json_response({"ok": False, "message": "invalid verification code"}, status=401)

        self.login_otp_sessions.pop(otp_token, None)

        users = await self._load_state("users")
        if not isinstance(users, list):
            users = []
        users = self._ensure_default_admin_user([item for item in users if isinstance(item, dict)])

        for user in users:
            if str(user.get("email", "")).strip().lower() != email:
                continue
            public_user = dict(user)
            public_user.pop("password", None)
            discord_link_token = self._issue_discord_link_token(public_user)
            has_discord_link = bool(str(public_user.get("discordId") or "").strip())
            requires_discord = bool(self.discord_link_required_on_login and self._is_discord_oauth_ready() and not has_discord_link)
            session_token = self._issue_shop_session_token(public_user)
            await self._append_security_log(f"User 2FA Authentication Successful: {email}", "SUCCESS")
            return web.json_response(
                {
                    "ok": True,
                    "user": public_user,
                    "sessionToken": session_token,
                    "discordLinkToken": discord_link_token,
                    "requiresDiscord": requires_discord,
                    "message": "Connect Discord to continue" if requires_discord else "",
                }
            )

        await self._append_security_log(f"User not found after OTP verify: {email}", "CRITICAL")
        return web.json_response({"ok": False, "message": "user not found"}, status=404)

    async def shop_auth_register(self, request: web.Request):
        payload = await self._safe_json(request)
        if payload is None:
            return web.json_response({"ok": False, "message": "invalid json body"}, status=400)
        email = str(payload.get("email", "")).strip().lower()
        password = str(payload.get("password", "")).strip()
        if not email or not password:
            return web.json_response({"ok": False, "message": "email and password are required"}, status=400)

        users = await self._load_state("users")
        if not isinstance(users, list):
            users = []
        users = self._ensure_default_admin_user([item for item in users if isinstance(item, dict)])
        if any(str(item.get("email", "")).strip().lower() == email for item in users):
            return web.json_response({"ok": False, "message": "user already exists"}, status=409)

        user = {
            "id": f"user-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
            "email": email,
            "password": self._hash_password(password),
            "role": "user",
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "discordId": "",
            "discordUsername": "",
            "discordAvatar": "",
            "discordLinkedAt": "",
        }
        users.append(user)
        await self._save_state("users", users)
        await self._append_security_log(f"New User Registered: {email}", "SUCCESS")

        public_user = dict(user)
        public_user.pop("password", None)
        return web.json_response(
            {
                "ok": True,
                "user": public_user,
                "sessionToken": self._issue_shop_session_token(public_user),
            }
        )

    async def shop_auth_discord_link_token(self, request: web.Request):
        auth_user = self._shop_user_from_request(request)
        if not isinstance(auth_user, dict):
            return web.json_response({"ok": False, "message": "unauthorized"}, status=401)

        user_id = str(auth_user.get("id") or "").strip()
        email = str(auth_user.get("email") or "").strip().lower()
        if not user_id or not email:
            return web.json_response({"ok": False, "message": "invalid session user"}, status=401)

        users = await self._load_state("users")
        if not isinstance(users, list):
            users = []
        users = self._ensure_default_admin_user([item for item in users if isinstance(item, dict)])

        target_user: Optional[dict[str, Any]] = None
        for user in users:
            if str(user.get("id") or "").strip() != user_id:
                continue
            if str(user.get("email") or "").strip().lower() != email:
                continue
            target_user = user
            break

        if target_user is None:
            return web.json_response({"ok": False, "message": "user not found"}, status=404)

        public_user = dict(target_user)
        public_user.pop("password", None)
        link_token = self._issue_discord_link_token(public_user)
        return web.json_response({"ok": True, "linkToken": link_token})

    async def shop_auth_discord_connect_url(self, request: web.Request):
        auth_user = self._shop_user_from_request(request)
        if not isinstance(auth_user, dict):
            return web.json_response({"ok": False, "message": "unauthorized"}, status=401)

        payload = await self._safe_json(request)
        if payload is None:
            return web.json_response({"ok": False, "message": "invalid json body"}, status=400)

        if not self._is_discord_oauth_ready():
            return web.json_response({"ok": False, "message": "discord oauth is not configured"}, status=503)

        link_token = str(payload.get("linkToken") or "").strip()
        return_url = str(payload.get("returnUrl") or "").strip()
        if not link_token:
            return web.json_response({"ok": False, "message": "link token is required"}, status=400)

        self._purge_expired_discord_link_tokens()
        self._purge_expired_discord_oauth_states()
        token_row = self.discord_link_tokens.get(link_token)
        if not isinstance(token_row, dict):
            return web.json_response({"ok": False, "message": "invalid or expired link token"}, status=401)
        if str(token_row.get("userId") or "").strip() != str(auth_user.get("id") or "").strip():
            return web.json_response({"ok": False, "message": "link token does not belong to current user"}, status=403)
        if str(token_row.get("email") or "").strip().lower() != str(auth_user.get("email") or "").strip().lower():
            return web.json_response({"ok": False, "message": "link token does not belong to current user"}, status=403)

        normalized_return_url = self._sanitize_discord_return_url(return_url)
        state = secrets.token_urlsafe(24)
        self.discord_oauth_states[state] = {
            "linkToken": link_token,
            "returnUrl": normalized_return_url,
            "expiresAt": (datetime.now(timezone.utc) + timedelta(seconds=self.discord_oauth_state_ttl_seconds)).isoformat(),
        }

        authorize_query = urlencode(
            {
                "client_id": self.discord_oauth_client_id,
                "response_type": "code",
                "redirect_uri": self.discord_oauth_redirect_uri,
                "scope": self.discord_oauth_scopes,
                "state": state,
            }
        )
        authorize_url = f"{self.discord_oauth_authorize_url}?{authorize_query}"
        return web.json_response({"ok": True, "url": authorize_url})

    async def shop_auth_discord_callback(self, request: web.Request):
        self._purge_expired_discord_link_tokens()
        self._purge_expired_discord_oauth_states()

        state = str(request.query.get("state") or "").strip()
        if not state:
            return web.Response(text="Missing Discord OAuth state.", status=400)

        oauth_state = self.discord_oauth_states.pop(state, None)
        if not isinstance(oauth_state, dict):
            return web.Response(text="Invalid or expired Discord OAuth state.", status=400)

        return_url = self._sanitize_discord_return_url(str(oauth_state.get("returnUrl") or ""))

        oauth_error = str(request.query.get("error") or "").strip()
        if oauth_error:
            await self._append_security_log(f"Discord OAuth canceled or failed: {oauth_error}", "WARNING")
            raise web.HTTPFound(
                self._append_query_params(
                    return_url,
                    {
                        "discord": "error",
                        "message": oauth_error,
                    },
                )
            )

        code = str(request.query.get("code") or "").strip()
        if not code:
            raise web.HTTPFound(
                self._append_query_params(
                    return_url,
                    {
                        "discord": "error",
                        "message": "missing_oauth_code",
                    },
                )
            )

        link_token = str(oauth_state.get("linkToken") or "").strip()
        token_row = self.discord_link_tokens.get(link_token)
        if not isinstance(token_row, dict):
            raise web.HTTPFound(
                self._append_query_params(
                    return_url,
                    {
                        "discord": "error",
                        "message": "link_session_expired",
                    },
                )
            )

        discord_identity = await self._fetch_discord_oauth_identity(code)
        if not isinstance(discord_identity, dict):
            await self._append_security_log("Discord OAuth user fetch failed", "WARNING")
            raise web.HTTPFound(
                self._append_query_params(
                    return_url,
                    {
                        "discord": "error",
                        "message": "discord_fetch_failed",
                    },
                )
            )

        discord_user = discord_identity.get("user")
        if not isinstance(discord_user, dict):
            raise web.HTTPFound(
                self._append_query_params(
                    return_url,
                    {
                        "discord": "error",
                        "message": "discord_profile_invalid",
                    },
                )
            )
        discord_access_token = str(discord_identity.get("accessToken") or "").strip()

        discord_id = str(discord_user.get("id") or "").strip()
        if not discord_id:
            raise web.HTTPFound(
                self._append_query_params(
                    return_url,
                    {
                        "discord": "error",
                        "message": "discord_id_missing",
                    },
                )
            )

        users = await self._load_state("users")
        if not isinstance(users, list):
            users = []
        users = self._ensure_default_admin_user([item for item in users if isinstance(item, dict)])

        target_user_id = str(token_row.get("userId") or "").strip()
        target_email = str(token_row.get("email") or "").strip().lower()
        target_user: Optional[dict[str, Any]] = None
        for user in users:
            user_id = str(user.get("id") or "").strip()
            user_email = str(user.get("email") or "").strip().lower()
            if user_id == target_user_id and user_email == target_email:
                target_user = user
                break

        if target_user is None:
            self.discord_link_tokens.pop(link_token, None)
            raise web.HTTPFound(
                self._append_query_params(
                    return_url,
                    {
                        "discord": "error",
                        "message": "user_not_found",
                    },
                )
            )

        for user in users:
            if user is target_user:
                continue
            if str(user.get("discordId") or "").strip() == discord_id:
                raise web.HTTPFound(
                    self._append_query_params(
                        return_url,
                        {
                            "discord": "error",
                            "message": "discord_already_linked",
                        },
                    )
                )

        username = str(discord_user.get("global_name") or discord_user.get("username") or "").strip()
        avatar_hash = str(discord_user.get("avatar") or "").strip()
        avatar_url = ""
        if avatar_hash:
            avatar_url = f"https://cdn.discordapp.com/avatars/{discord_id}/{avatar_hash}.png?size=256"

        target_user["discordId"] = discord_id
        target_user["discordUsername"] = username
        target_user["discordAvatar"] = avatar_url
        target_user["discordLinkedAt"] = datetime.now(timezone.utc).isoformat()
        await self._save_state("users", users)
        guild_joined = await self._try_auto_join_discord_guild(discord_id, discord_access_token)
        self.discord_link_tokens.pop(link_token, None)
        await self._append_security_log(
            f"Discord linked for {str(target_user.get('email') or '').strip().lower()} ({discord_id})",
            "SUCCESS",
        )
        if self._can_auto_join_discord_guild():
            await self._append_security_log(
                f"Discord guild auto-join {'succeeded' if guild_joined else 'failed'} for {str(target_user.get('email') or '').strip().lower()}",
                "SUCCESS" if guild_joined else "WARNING",
            )

        raise web.HTTPFound(
            self._append_query_params(
                return_url,
                {
                    "discord": "linked",
                    "discordId": discord_id,
                    "discordUsername": username,
                    "discordAvatar": avatar_url,
                    "guildJoined": "1" if guild_joined else "0",
                    "email": str(target_user.get("email") or "").strip().lower(),
                },
            )
        )

    async def shop_auth_discord_unlink(self, request: web.Request):
        auth_user = self._shop_user_from_request(request)
        if not isinstance(auth_user, dict):
            return web.json_response({"ok": False, "message": "unauthorized"}, status=401)

        user_id = str(auth_user.get("id") or "").strip()
        email = str(auth_user.get("email") or "").strip().lower()
        if not user_id or not email:
            return web.json_response({"ok": False, "message": "invalid session user"}, status=401)

        users = await self._load_state("users")
        if not isinstance(users, list):
            users = []
        users = self._ensure_default_admin_user([item for item in users if isinstance(item, dict)])

        target_user: Optional[dict[str, Any]] = None
        for user in users:
            if str(user.get("id") or "").strip() != user_id:
                continue
            if str(user.get("email") or "").strip().lower() != email:
                continue
            target_user = user
            break

        if target_user is None:
            return web.json_response({"ok": False, "message": "user not found"}, status=404)

        target_user["discordId"] = ""
        target_user["discordUsername"] = ""
        target_user["discordAvatar"] = ""
        target_user["discordLinkedAt"] = ""
        await self._save_state("users", users)
        await self._append_security_log(f"Discord unlinked for {email}", "WARNING")

        public_user = dict(target_user)
        public_user.pop("password", None)
        return web.json_response({"ok": True, "user": public_user})

    async def _load_payment_method_toggles(self) -> dict[str, bool]:
        toggles = {"pm-card": True, "pm-paypal": True, "pm-crypto": True}
        state = await self._load_state("payment_methods")
        if not isinstance(state, list):
            return toggles

        for row in state:
            if not isinstance(row, dict):
                continue
            raw_id = str(row.get("id") or "").strip().lower()
            normalized_id = raw_id
            if raw_id == "card":
                normalized_id = "pm-card"
            elif raw_id == "paypal":
                normalized_id = "pm-paypal"
            elif raw_id == "crypto":
                normalized_id = "pm-crypto"
            if normalized_id in toggles:
                toggles[normalized_id] = bool(row.get("enabled", True))
        return toggles

    def _paypal_manual_url_from_source(self, source: str, amount: float = 0.0, order_id: str = "") -> str:
        candidate = (source or "").strip()
        if not candidate:
            return ""

        currency = (self.stripe_currency or "usd").upper()
        if "{" in candidate and "}" in candidate:
            return (
                candidate
                .replace("{amount}", f"{amount:.2f}")
                .replace("{currency}", currency)
                .replace("{order_id}", str(order_id or ""))
            )

        lower_candidate = candidate.lower()
        if lower_candidate.startswith("paypal.me/") or lower_candidate.startswith("www.paypal.me/"):
            candidate = f"https://{candidate}"
            lower_candidate = candidate.lower()

        if lower_candidate.startswith("http://") or lower_candidate.startswith("https://"):
            return candidate

        if "@" in candidate and " " not in candidate:
            params: dict[str, str] = {
                "cmd": "_xclick",
                "business": candidate,
                "currency_code": currency,
                "item_name": f"Roblox Keys Order {order_id}" if order_id else "Roblox Keys Order",
            }
            if amount > 0:
                params["amount"] = f"{amount:.2f}"
            return f"https://www.paypal.com/cgi-bin/webscr?{urlencode(params)}"

        return f"https://www.paypal.me/{candidate}"

    async def _resolve_paypal_manual_checkout_url(self, amount: float = 0.0, order_id: str = "") -> str:
        if self.paypal_checkout_url:
            return self._paypal_manual_url_from_source(self.paypal_checkout_url, amount=amount, order_id=order_id)

        settings = await self._load_state("settings")
        settings_value = settings if isinstance(settings, dict) else {}
        paypal_setting = str(settings_value.get("paypalEmail") or "").strip()
        if not paypal_setting:
            return ""
        return self._paypal_manual_url_from_source(paypal_setting, amount=amount, order_id=order_id)

    async def _compute_payment_methods(self) -> dict[str, dict[str, bool]]:
        toggles = await self._load_payment_method_toggles()

        card_enabled = bool(self.stripe_secret_key) and toggles.get("pm-card", True)
        paypal_automated = bool(self.paypal_client_id and self.paypal_client_secret)
        paypal_manual_url = await self._resolve_paypal_manual_checkout_url()
        paypal_enabled = (paypal_automated or bool(paypal_manual_url)) and toggles.get("pm-paypal", True)
        crypto_automated = bool(self.oxapay_merchant_api_key)
        crypto_enabled = (crypto_automated or bool(self.crypto_checkout_url)) and toggles.get("pm-crypto", True)

        return {
            "card": {"enabled": card_enabled, "automated": True},
            "paypal": {"enabled": paypal_enabled, "automated": paypal_automated},
            "crypto": {"enabled": crypto_enabled, "automated": crypto_automated},
        }

    async def shop_payment_methods(self, request: web.Request):
        cached = self._get_cache("payment_methods")
        if cached is not None:
            return web.json_response(cached)
        methods = await self._compute_payment_methods()
        result = {"ok": True, "methods": methods}
        self._set_cache("payment_methods", result)
        return web.json_response(result)

    async def shop_analytics(self, request: web.Request):
        summary_response = await self.shop_admin_summary(request)
        try:
            payload = json.loads(summary_response.text)
        except Exception:
            return web.json_response({"ok": False, "message": "failed to build analytics"}, status=500)

        metrics = payload.get("metrics") if isinstance(payload, dict) else {}
        top_products = payload.get("topProducts") if isinstance(payload, dict) else []
        orders = payload.get("orders") if isinstance(payload, dict) else []
        customers = payload.get("customers") if isinstance(payload, dict) else []
        requested_range = str(request.query.get("range", "30d")).strip() or "30d"

        return web.json_response(
            {
                "ok": True,
                "range": requested_range,
                "metrics": metrics if isinstance(metrics, dict) else {},
                "topProducts": top_products if isinstance(top_products, list) else [],
                "orders": orders if isinstance(orders, list) else [],
                "customers": customers if isinstance(customers, list) else [],
            }
        )

    async def shop_validate_license(self, request: web.Request):
        payload = await self._safe_json(request)
        if payload is None:
            return web.json_response({"ok": False, "message": "invalid json body"}, status=400)

        license_key = str(payload.get("key") or payload.get("license") or "").strip()
        if not license_key:
            return web.json_response({"ok": False, "message": "license key is required"}, status=400)

        orders = await self._load_orders()
        for order in orders:
            if not isinstance(order, dict):
                continue
            if str(order.get("status") or "").strip().lower() != "completed":
                continue

            credentials = order.get("credentials")
            if not isinstance(credentials, dict):
                continue

            for line_id, blob in credentials.items():
                lines = [str(row).strip() for row in str(blob or "").splitlines() if str(row).strip()]
                if license_key not in lines:
                    continue

                matched_item = None
                for item in order.get("items", []) if isinstance(order.get("items"), list) else []:
                    if not isinstance(item, dict):
                        continue
                    item_id = str(item.get("id") or item.get("productId") or "").strip()
                    tier_id = str(item.get("tierId") or "").strip()
                    lookup_id = f"{item_id}::{tier_id}" if tier_id else item_id
                    if line_id == lookup_id or line_id == item_id:
                        matched_item = item
                        break

                return web.json_response(
                    {
                        "ok": True,
                        "valid": True,
                        "key": license_key,
                        "orderId": str(order.get("id") or ""),
                        "status": str(order.get("status") or "completed"),
                        "product": matched_item or {},
                        "issuedAt": str(order.get("createdAt") or ""),
                    }
                )

        return web.json_response({"ok": True, "valid": False, "key": license_key})

    async def shop_get_coupons(self, request: web.Request):
        coupons = await self._load_state("coupons")
        if not isinstance(coupons, list):
            coupons = []
        rows = [row for row in coupons if isinstance(row, dict)]
        rows.sort(key=lambda row: str(row.get("createdAt") or ""), reverse=True)
        return web.json_response({"ok": True, "coupons": rows, "data": rows})

    async def shop_create_coupon(self, request: web.Request):
        payload = await self._safe_json(request)
        if payload is None:
            return web.json_response({"ok": False, "message": "invalid json body"}, status=400)

        raw_code = str(payload.get("code") or "").strip()
        if not raw_code:
            return web.json_response({"ok": False, "message": "coupon code is required"}, status=400)

        code = raw_code.upper()
        discount_type = str(payload.get("type") or payload.get("discountType") or "percent").strip().lower()
        if discount_type not in {"percent", "fixed"}:
            discount_type = "percent"

        discount_value = self._to_float(payload.get("value") or payload.get("discountValue"), default=0.0) or 0.0
        if discount_value <= 0:
            return web.json_response({"ok": False, "message": "coupon value must be greater than 0"}, status=400)

        coupons = await self._load_state("coupons")
        if not isinstance(coupons, list):
            coupons = []
        rows = [row for row in coupons if isinstance(row, dict)]

        if any(str(row.get("code") or "").strip().upper() == code for row in rows):
            return web.json_response({"ok": False, "message": "coupon already exists"}, status=409)

        now_iso = datetime.now(timezone.utc).isoformat()
        coupon = {
            "id": f"cpn-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
            "code": code,
            "type": discount_type,
            "value": discount_value,
            "enabled": bool(payload.get("enabled", True)),
            "maxUses": self._to_int(payload.get("maxUses"), default=0) or 0,
            "usedCount": 0,
            "createdAt": now_iso,
            "expiresAt": str(payload.get("expiresAt") or "").strip() or None,
        }
        rows.append(coupon)
        await self._save_state("coupons", rows)
        return web.json_response({"ok": True, "coupon": coupon, "data": coupon})

    async def shop_admin_summary(self, request: web.Request):
        products_raw = await self._load_products()
        product_name_by_id: dict[str, str] = {}
        tier_name_by_key: dict[tuple[str, str], str] = {}
        for product in products_raw:
            if not isinstance(product, dict):
                continue
            pid = str(product.get("id") or "").strip()
            if not pid:
                continue
            pname = str(product.get("name") or "").strip()
            if pname:
                product_name_by_id[pid] = pname

            tiers = product.get("tiers", [])
            if isinstance(tiers, list):
                for tier in tiers:
                    if not isinstance(tier, dict):
                        continue
                    tid = str(tier.get("id") or "").strip()
                    tname = str(tier.get("name") or "").strip()
                    if tid and tname:
                        tier_name_by_key[(pid, tid)] = tname

        orders_raw = await self._load_orders()
        orders: list[dict[str, Any]] = []
        customer_map: dict[str, dict[str, Any]] = {}
        top_products: dict[str, dict[str, Any]] = {}

        revenue = 0.0
        units_sold = 0
        pending_orders = 0
        completed_orders = 0

        for order in orders_raw:
            if not isinstance(order, dict):
                continue

            status = str(order.get("status") or "pending").strip().lower()
            if status not in {"completed", "pending", "refunded", "cancelled"}:
                status = "pending"

            total = self._to_float(order.get("total"), default=0.0) or 0.0
            created_at = str(order.get("createdAt") or datetime.now(timezone.utc).isoformat())
            payment_method = str(order.get("paymentMethod") or "").strip()
            user_id = str(order.get("userId") or "guest").strip() or "guest"

            user_payload = order.get("user")
            user_data = user_payload if isinstance(user_payload, dict) else {}
            customer_email = str(user_data.get("email") or "").strip()
            customer_id = str(user_data.get("id") or user_id).strip() or user_id
            customer_key = customer_email.lower() or customer_id

            items_raw = order.get("items")
            items = items_raw if isinstance(items_raw, list) else []

            orders.append(
                {
                    "id": str(order.get("id") or ""),
                    "userId": user_id,
                    "user": user_data,
                    "items": items,
                    "total": total,
                    "status": status,
                    "createdAt": created_at,
                    "paymentMethod": payment_method,
                }
            )

            if status == "pending":
                pending_orders += 1
            if status == "completed":
                completed_orders += 1
                revenue += total

            customer_entry = customer_map.get(customer_key)
            if customer_entry is None:
                customer_entry = {
                    "id": customer_id,
                    "email": customer_email,
                    "orders": 0,
                    "totalSpent": 0.0,
                    "createdAt": str(user_data.get("createdAt") or created_at),
                }
                customer_map[customer_key] = customer_entry

            customer_entry["orders"] = int(customer_entry.get("orders", 0)) + 1
            if status == "completed":
                customer_entry["totalSpent"] = float(customer_entry.get("totalSpent", 0.0)) + total

            if status != "completed":
                continue

            for item in items:
                if not isinstance(item, dict):
                    continue
                quantity = max(0, self._to_int(item.get("quantity"), default=0) or 0)
                if quantity <= 0:
                    continue
                units_sold += quantity

                item_id = str(item.get("productId") or item.get("id") or "").strip()
                if item_id and "::" in item_id:
                    item_id = item_id.split("::", 1)[0].strip()
                tier_id = str(item.get("tierId") or "").strip()

                canonical_name = product_name_by_id.get(item_id, "").strip() if item_id else ""
                if canonical_name and tier_id:
                    tier_name = tier_name_by_key.get((item_id, tier_id), "").strip()
                    if tier_name:
                        canonical_name = f"{canonical_name} ({tier_name})"

                name = (canonical_name or str(item.get("name") or item_id or "Unknown Product")).strip()
                item_price = self._to_float(item.get("price"), default=0.0) or 0.0

                bucket_key = item_id or name
                product_entry = top_products.get(bucket_key)
                if product_entry is None:
                    product_entry = {
                        "id": item_id or name,
                        "name": name,
                        "units": 0,
                        "revenue": 0.0,
                    }
                    top_products[bucket_key] = product_entry

                product_entry["units"] = int(product_entry.get("units", 0)) + quantity
                product_entry["revenue"] = float(product_entry.get("revenue", 0.0)) + (item_price * quantity)

        users_state = await self._load_state("users")
        if isinstance(users_state, list):
            for user in users_state:
                if not isinstance(user, dict):
                    continue
                role = str(user.get("role") or "user").strip().lower()
                if role == "admin":
                    continue
                user_email = str(user.get("email") or "").strip()
                user_id = str(user.get("id") or user_email or "").strip()
                if not user_id and not user_email:
                    continue
                customer_key = user_email.lower() or user_id
                if customer_key in customer_map:
                    continue
                customer_map[customer_key] = {
                    "id": user_id or customer_key,
                    "email": user_email,
                    "orders": 0,
                    "totalSpent": 0.0,
                    "createdAt": str(user.get("createdAt") or datetime.now(timezone.utc).isoformat()),
                }

        orders.sort(key=lambda row: str(row.get("createdAt") or ""), reverse=True)
        customers = list(customer_map.values())
        customers.sort(key=lambda row: (int(row.get("orders", 0)), float(row.get("totalSpent", 0.0))), reverse=True)

        top_products_rows = list(top_products.values())
        top_products_rows.sort(key=lambda row: int(row.get("units", 0)), reverse=True)

        return web.json_response(
            {
                "ok": True,
                "orders": orders,
                "customers": customers,
                "metrics": {
                    "revenue": revenue,
                    "unitsSold": units_sold,
                    "pendingOrders": pending_orders,
                    "completedOrders": completed_orders,
                    "totalOrders": len(orders),
                    "customers": len(customers),
                },
                "topProducts": top_products_rows[:5],
            }
        )

    async def shop_update_order_status(self, request: web.Request):
        order_id = str(request.match_info.get("order_id", "")).strip()
        if not order_id:
            return web.json_response({"ok": False, "message": "order id is required"}, status=400)

        payload = await self._safe_json(request)
        if payload is None:
            return web.json_response({"ok": False, "message": "invalid json body"}, status=400)

        status = str(payload.get("status") or "").strip().lower()
        if status not in {"pending", "completed", "refunded", "cancelled"}:
            return web.json_response({"ok": False, "message": "invalid status"}, status=400)

        orders = await self._load_orders()
        target: Optional[dict[str, Any]] = None
        for row in orders:
            if not isinstance(row, dict):
                continue
            if str(row.get("id") or "") != order_id:
                continue
            row["status"] = status
            target = row
            break

        if target is None:
            return web.json_response({"ok": False, "message": "order not found"}, status=404)

        await self._save_orders(orders)
        return web.json_response({"ok": True, "order": target})

    async def shop_upload_media(self, request: web.Request):
        content_type = str(request.content_type or "").strip().lower()
        if "multipart/form-data" not in content_type:
            return web.json_response({"ok": False, "message": "multipart/form-data is required"}, status=400)

        try:
            reader = await request.multipart()
        except Exception:
            return web.json_response({"ok": False, "message": "invalid multipart body"}, status=400)

        file_part = None
        while True:
            part = await reader.next()
            if part is None:
                break
            if str(getattr(part, "name", "")).strip().lower() == "file":
                file_part = part
                break

        if file_part is None:
            return web.json_response({"ok": False, "message": "file field is required"}, status=400)

        file_name = str(getattr(file_part, "filename", "") or "").strip()
        if not file_name:
            return web.json_response({"ok": False, "message": "file name is required"}, status=400)

        part_content_type = str(file_part.headers.get("Content-Type", "") or "").split(";", 1)[0].strip().lower()
        if not part_content_type:
            guessed, _ = mimetypes.guess_type(file_name)
            part_content_type = str(guessed or "").strip().lower()
        allowed_types = {"image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"}
        if part_content_type not in allowed_types:
            return web.json_response({"ok": False, "message": "unsupported image type"}, status=400)

        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = await file_part.read_chunk(size=64 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > self.image_upload_max_bytes:
                return web.json_response(
                    {
                        "ok": False,
                        "message": f"file too large (max {self.image_upload_max_bytes} bytes)",
                    },
                    status=413,
                )
            chunks.append(chunk)

        if total <= 0:
            return web.json_response({"ok": False, "message": "uploaded file is empty"}, status=400)

        raw = b"".join(chunks)
        encoded = base64.b64encode(raw).decode("ascii")
        created_at = datetime.now(timezone.utc).isoformat()
        asset_id = f"img-{int(datetime.now(timezone.utc).timestamp() * 1000)}-{secrets.token_hex(4)}"
        asset = {
            "id": asset_id,
            "filename": file_name,
            "mimeType": part_content_type,
            "size": total,
            "createdAt": created_at,
            "dataBase64": encoded,
        }
        asset_path = f"/shop/media/{asset_id}"
        try:
            asset_url = str(request.url.with_path(asset_path).with_query({}))
        except Exception:
            asset_url = asset_path

        library = await self._load_media_library()
        library = [asset] + [row for row in library if isinstance(row, dict) and str(row.get("id", "")) != asset_id]
        library = library[: self.image_upload_max_entries]
        await self._save_media_library(library)

        return web.json_response(
            {
                "ok": True,
                "asset": {
                    "id": asset_id,
                        "filename": file_name,
                        "mimeType": part_content_type,
                        "size": total,
                        "createdAt": created_at,
                        "url": asset_url,
                    },
                }
        )

    async def shop_upsert_product(self, request: web.Request):
        payload = await self._safe_json(request)
        if payload is None:
            return web.json_response({"ok": False, "message": "invalid json body"}, status=400)

        product = payload.get("product", payload)
        if not isinstance(product, dict):
            return web.json_response({"ok": False, "message": "product payload is required"}, status=400)

        normalized = self._normalize_product(product)
        if not normalized.get("id"):
            return web.json_response({"ok": False, "message": "product id is required"}, status=400)

        products = await self._load_products()
        product_id = str(normalized["id"])
        replaced = False
        for idx, existing in enumerate(products):
            if str(existing.get("id")) == product_id:
                # Keep existing inventory unless explicitly provided in payload.
                if "inventory" not in product and isinstance(existing.get("inventory"), list):
                    normalized["inventory"] = [str(item) for item in existing.get("inventory", []) if str(item).strip()]
                if "tiers" not in product and isinstance(existing.get("tiers"), list):
                    normalized["tiers"] = [
                        self._normalize_tier(tier) for tier in existing.get("tiers", []) if isinstance(tier, dict)
                    ]
                elif isinstance(product.get("tiers"), list):
                    incoming_tier_payload = {
                        str(tier.get("id", "")).strip(): tier
                        for tier in product.get("tiers", [])
                        if isinstance(tier, dict)
                    }
                    existing_tiers = {
                        str(tier.get("id", "")).strip(): tier
                        for tier in existing.get("tiers", [])
                        if isinstance(tier, dict)
                    }
                    merged_tiers: list[dict[str, Any]] = []
                    for tier in normalized.get("tiers", []):
                        tier_id = str(tier.get("id", "")).strip()
                        if not tier_id:
                            continue
                        raw_payload_tier = incoming_tier_payload.get(tier_id, {})
                        existing_tier = existing_tiers.get(tier_id)
                        if (
                            isinstance(existing_tier, dict)
                            and isinstance(raw_payload_tier, dict)
                            and "inventory" not in raw_payload_tier
                            and isinstance(existing_tier.get("inventory"), list)
                        ):
                            tier["inventory"] = [
                                str(item).strip() for item in existing_tier.get("inventory", []) if str(item).strip()
                            ]
                            tier["stock"] = len(tier["inventory"])
                        merged_tiers.append(self._normalize_tier(tier))
                    normalized["tiers"] = merged_tiers

                normalized["stock"] = self._compute_product_stock(normalized)
                products[idx] = normalized
                replaced = True
                break
        if not replaced:
            products.append(normalized)

        await self._save_products(products)
        return web.json_response(
            {
                "ok": True,
                "product": self._public_product(normalized),
                "products": [self._public_product(product) for product in products],
            }
        )
        self._invalidate_cache("products", "health")

    async def shop_delete_product(self, request: web.Request):
        product_id = str(request.match_info.get("product_id", "")).strip()
        if not product_id:
            return web.json_response({"ok": False, "message": "product id is required"}, status=400)

        products = await self._load_products()
        filtered = [product for product in products if str(product.get("id")) != product_id]
        if len(filtered) == len(products):
            return web.json_response({"ok": False, "message": "product not found"}, status=404)

        await self._save_products(filtered)
        self._invalidate_cache("products", "health")
        return web.json_response({"ok": True, "products": [self._public_product(product) for product in filtered]})

    async def shop_get_inventory(self, request: web.Request):
        product_id = str(request.match_info.get("product_id", "")).strip()
        tier_id = str(request.query.get("tierId", "")).strip()
        if not product_id:
            return web.json_response({"ok": False, "message": "product id is required"}, status=400)

        products = await self._load_products()
        for product in products:
            if str(product.get("id")) != product_id:
                continue
            if tier_id:
                tier = self._find_tier(product, tier_id)
                if tier is None:
                    return web.json_response({"ok": False, "message": "tier not found"}, status=404)
                tier_inventory = [str(item) for item in tier.get("inventory", []) if str(item).strip()]
                return web.json_response(
                    {
                        "ok": True,
                        "productId": product_id,
                        "tierId": tier_id,
                        "stock": len(tier_inventory),
                        "inventory": tier_inventory,
                    }
                )
            inventory = [str(item) for item in product.get("inventory", []) if str(item).strip()]
            return web.json_response(
                {
                    "ok": True,
                    "productId": product_id,
                    "stock": len(inventory),
                    "inventory": inventory,
                }
            )

        return web.json_response({"ok": False, "message": "product not found"}, status=404)

    async def shop_add_inventory(self, request: web.Request):
        payload = await self._safe_json(request)
        if payload is None:
            return web.json_response({"ok": False, "message": "invalid json body"}, status=400)

        product_id = str(payload.get("productId", "")).strip()
        tier_id = str(payload.get("tierId", "")).strip()
        raw_items = payload.get("items", [])
        if not product_id:
            return web.json_response({"ok": False, "message": "productId is required"}, status=400)
        if not isinstance(raw_items, list):
            return web.json_response({"ok": False, "message": "items must be an array"}, status=400)

        items = [str(item).strip() for item in raw_items if str(item).strip()]
        if not items:
            return web.json_response({"ok": False, "message": "at least one inventory item is required"}, status=400)

        products = await self._load_products()
        for idx, product in enumerate(products):
            if str(product.get("id")) != product_id:
                continue

            if tier_id:
                tier = self._find_tier(product, tier_id)
                if tier is None:
                    return web.json_response({"ok": False, "message": "tier not found"}, status=404)
                tier_inventory = [str(item) for item in tier.get("inventory", []) if str(item).strip()]
                tier_inventory.extend(items)
                tier["inventory"] = tier_inventory
                tier["stock"] = len(tier_inventory)
                product["stock"] = self._compute_product_stock(product)
                products[idx] = self._normalize_product(product)
                await self._save_products(products)
                return web.json_response(
                    {
                        "ok": True,
                        "product": self._public_product(products[idx]),
                        "stock": len(tier_inventory),
                        "tierId": tier_id,
                        "products": [self._public_product(item) for item in products],
                    }
                )

            existing = [str(item) for item in product.get("inventory", []) if str(item).strip()]
            existing.extend(items)
            product["inventory"] = existing
            product["stock"] = len(existing)
            products[idx] = self._normalize_product(product)
            await self._save_products(products)
            return web.json_response(
                {
                    "ok": True,
                    "product": self._public_product(products[idx]),
                    "stock": len(existing),
                    "products": [self._public_product(item) for item in products],
                }
            )

        return web.json_response({"ok": False, "message": "product not found"}, status=404)

    async def shop_update_stock(self, request: web.Request):
        payload = await self._safe_json(request)
        if payload is None:
            return web.json_response({"ok": False, "message": "invalid json body"}, status=400)

        product_id = str(payload.get("productId", "")).strip()
        tier_id = str(payload.get("tierId", "")).strip()
        delta = self._to_int(payload.get("delta"), default=None)
        if not product_id:
            return web.json_response({"ok": False, "message": "productId is required"}, status=400)
        if delta is None:
            return web.json_response({"ok": False, "message": "delta is required"}, status=400)

        products = await self._load_products()
        for idx, product in enumerate(products):
            if str(product.get("id")) != product_id:
                continue
            has_tiers = isinstance(product.get("tiers"), list) and len(product.get("tiers", [])) > 0

            if has_tiers and not tier_id:
                return web.json_response(
                    {"ok": False, "message": "This product uses tiers. Provide tierId and add real keys per tier."},
                    status=400,
                )

            if tier_id:
                tier = self._find_tier(product, tier_id)
                if tier is None:
                    return web.json_response({"ok": False, "message": "tier not found"}, status=404)
                inventory = [str(item) for item in tier.get("inventory", []) if str(item).strip()]
                if delta > 0:
                    return web.json_response(
                        {"ok": False, "message": "Cannot increase stock numerically. Add real stock keys via /shop/inventory/add."},
                        status=400,
                    )
                if delta < 0 and inventory:
                    remove_count = min(abs(delta), len(inventory))
                    inventory = inventory[: len(inventory) - remove_count]
                    tier["inventory"] = inventory
                    tier["stock"] = len(inventory)
                else:
                    tier["stock"] = max(0, (self._to_int(tier.get("stock"), default=0) or 0) + delta)
                product["stock"] = self._compute_product_stock(product)
                products[idx] = self._normalize_product(product)
                await self._save_products(products)
                return web.json_response(
                    {
                        "ok": True,
                        "product": self._public_product(products[idx]),
                        "tierId": tier_id,
                        "products": [self._public_product(item) for item in products],
                    }
                )

            current_stock = self._to_int(product.get("stock"), default=0) or 0
            inventory = [str(item) for item in product.get("inventory", []) if str(item).strip()]
            if delta > 0:
                return web.json_response(
                    {"ok": False, "message": "Cannot increase stock numerically. Add real stock keys via /shop/inventory/add."},
                    status=400,
                )

            if delta < 0 and inventory:
                remove_count = min(abs(delta), len(inventory))
                inventory = inventory[: len(inventory) - remove_count]
                product["inventory"] = inventory
                product["stock"] = len(inventory)
            else:
                product["stock"] = max(0, current_stock + delta)

            products[idx] = self._normalize_product(product)
            await self._save_products(products)
            return web.json_response(
                {
                    "ok": True,
                    "product": self._public_product(products[idx]),
                    "products": [self._public_product(item) for item in products],
                }
            )

        return web.json_response({"ok": False, "message": "product not found"}, status=404)

    async def _get_paypal_access_token(self) -> str:
        import time as _time
        now = _time.time()
        if self._paypal_access_token and now < self._paypal_token_expires_at:
            return self._paypal_access_token
        if not self.paypal_client_id or not self.paypal_client_secret:
            return ""
        try:
            import base64
            credentials = base64.b64encode(
                f"{self.paypal_client_id}:{self.paypal_client_secret}".encode()
            ).decode()
            async with ClientSession() as session:
                async with session.post(
                    f"{self.paypal_api_base}/v1/oauth2/token",
                    headers={
                        "Authorization": f"Basic {credentials}",
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    data="grant_type=client_credentials",
                    timeout=ClientTimeout(total=10),
                ) as resp:
                    if resp.status >= 300:
                        body = await resp.text()
                        logger.error(f"PayPal OAuth failed ({resp.status}): {body}")
                        return ""
                    data = await resp.json(content_type=None)
                    token = str(data.get("access_token") or "").strip()
                    expires_in = int(data.get("expires_in", 32400))
                    if token:
                        self._paypal_access_token = token
                        self._paypal_token_expires_at = now + min(expires_in, 28800)
                    return token
        except Exception as exc:
            logger.error(f"PayPal OAuth error: {exc}")
            return ""

    async def _prepare_order_items(
        self, raw_items: Any
    ) -> tuple[Optional[list[dict[str, Any]]], float, Optional[web.Response]]:
        if not isinstance(raw_items, list) or not raw_items:
            return None, 0.0, web.json_response({"ok": False, "message": "order items are required"}, status=400)

        products = await self._load_products()
        products_by_id = {str(product.get("id")): dict(product) for product in products if isinstance(product, dict)}
        normalized_items: list[dict[str, Any]] = []
        computed_total = 0.0

        for raw_item in raw_items:
            if not isinstance(raw_item, dict):
                return None, 0.0, web.json_response({"ok": False, "message": "invalid order item"}, status=400)

            item_id = str(raw_item.get("productId") or raw_item.get("id") or "").strip()
            if not str(raw_item.get("productId") or "").strip() and "::" in item_id:
                item_id = item_id.split("::", 1)[0].strip()
            tier_id = str(raw_item.get("tierId") or "").strip()
            quantity = self._to_int(raw_item.get("quantity"), default=0) or 0
            if not item_id or quantity <= 0:
                return None, 0.0, web.json_response({"ok": False, "message": "invalid item id or quantity"}, status=400)

            product = products_by_id.get(item_id)
            if product is None:
                return None, 0.0, web.json_response({"ok": False, "message": f"product {item_id} not found"}, status=404)

            unit_price = self._to_float(product.get("price"), default=0.0) or 0.0
            original_price = self._to_float(product.get("originalPrice"), default=0.0) or 0.0
            display_name = str(product.get("name") or item_id).strip()
            tier_name = ""
            if tier_id:
                tier = self._find_tier(product, tier_id)
                if tier is None:
                    return None, 0.0, web.json_response(
                        {"ok": False, "message": f"tier {tier_id} not found for {item_id}"},
                        status=404,
                    )
                tier_name = str(tier.get("name") or "").strip()
                if tier_name:
                    display_name = f"{display_name} {tier_name}"
                unit_price = self._to_float(tier.get("price"), default=0.0) or 0.0
                original_price = self._to_float(tier.get("originalPrice"), default=0.0) or 0.0

            if unit_price <= 0:
                return None, 0.0, web.json_response(
                    {"ok": False, "message": f"invalid price configured for {display_name or item_id}"},
                    status=400,
                )

            line_id = str(raw_item.get("id") or "").strip() or (f"{item_id}::{tier_id}" if tier_id else item_id)
            normalized_items.append(
                {
                    "id": line_id,
                    "productId": item_id,
                    "name": display_name,
                    "quantity": quantity,
                    "price": round(unit_price, 2),
                    "originalPrice": round(original_price, 2),
                    "tierId": tier_id,
                    "tierName": tier_name,
                    "duration": str(raw_item.get("duration") or product.get("duration") or "").strip(),
                    "image": str(raw_item.get("image") or product.get("image") or "").strip(),
                }
            )
            computed_total += float(unit_price) * quantity

        return normalized_items, round(computed_total, 2), None

    async def shop_buy(self, request: web.Request):
        if not await self._verify_turnstile(request):
            return web.json_response({"ok": False, "message": "bot verification failed"}, status=403)
        auth_user = self._shop_user_from_request(request)
        if not isinstance(auth_user, dict):
            return web.json_response({"ok": False, "message": "unauthorized"}, status=401)

        session_user = await self._get_public_user_by_identity(
            str(auth_user.get("id") or "").strip(),
            str(auth_user.get("email") or "").strip().lower(),
        )
        if not isinstance(session_user, dict):
            return web.json_response({"ok": False, "message": "user not found"}, status=401)

        payload = await self._safe_json(request)
        if payload is None:
            return web.json_response({"ok": False, "message": "invalid json body"}, status=400)

        order_data = payload.get("order", payload)
        payment_method = str(payload.get("paymentMethod", "")).strip().lower()
        payment_verified = bool(payload.get("paymentVerified", False))
        if not isinstance(order_data, dict):
            return web.json_response({"ok": False, "message": "order payload is required"}, status=400)
        prepared_items, computed_total, prepare_error = await self._prepare_order_items(order_data.get("items"))
        if prepare_error is not None:
            return prepare_error
        order_payload = dict(order_data)
        order_payload["items"] = prepared_items or []
        order_payload["total"] = computed_total

        if payment_method == "card" and not payment_verified:
            return web.json_response(
                {"ok": False, "message": "Card payments must be completed through /shop/payments/create"},
                status=402,
            )

        purchase = await self._process_purchase(order_payload, session_user, payment_method)
        if isinstance(purchase, web.Response):
            return purchase

        order_record, public_products = purchase
        self._invalidate_cache("products", "health")
        await self._send_order_log(order_record, session_user, payment_method)
        return web.json_response({"ok": True, "orderId": order_record["id"], "order": order_record, "products": public_products})

    async def shop_create_payment(self, request: web.Request):
        auth_user = self._shop_user_from_request(request)
        if not isinstance(auth_user, dict):
            return web.json_response({"ok": False, "message": "unauthorized"}, status=401)

        session_user = await self._get_public_user_by_identity(
            str(auth_user.get("id") or "").strip(),
            str(auth_user.get("email") or "").strip().lower(),
        )
        if not isinstance(session_user, dict):
            return web.json_response({"ok": False, "message": "user not found"}, status=401)

        payload = await self._safe_json(request)
        if payload is None:
            return web.json_response({"ok": False, "message": "invalid json body"}, status=400)

        payment_method = str(payload.get("paymentMethod", "")).strip().lower() or "card"
        order_data = payload.get("order", {})
        success_url = str(payload.get("successUrl", "")).strip()
        cancel_url = str(payload.get("cancelUrl", "")).strip()

        if not isinstance(order_data, dict):
            return web.json_response({"ok": False, "message": "order payload is required"}, status=400)
        prepared_items, computed_total, prepare_error = await self._prepare_order_items(order_data.get("items"))
        if prepare_error is not None:
            return prepare_error
        if computed_total <= 0:
            return web.json_response({"ok": False, "message": "order total must be greater than zero"}, status=400)
        order_payload = dict(order_data)
        order_payload["items"] = prepared_items or []
        order_payload["total"] = computed_total

        methods = await self._compute_payment_methods()
        selected_method = methods.get(payment_method)
        if payment_method in {"card", "paypal", "crypto"} and not (isinstance(selected_method, dict) and bool(selected_method.get("enabled"))):
            return web.json_response({"ok": False, "message": f"{payment_method} is not available"}, status=400)

        if payment_method != "card":
            if payment_method == "crypto" and self.oxapay_merchant_api_key:
                if computed_total < self.oxapay_min_amount:
                    return web.json_response(
                        {
                            "ok": False,
                            "message": f"OxaPay minimum amount is {self.oxapay_min_amount:.2f} {self.oxapay_currency}",
                        },
                        status=400,
                    )
                pending_token = secrets.token_urlsafe(24)
                pending = await self._load_pending_payments()
                pending[pending_token] = {
                    "order": order_payload,
                    "user": session_user,
                    "paymentMethod": payment_method,
                    "gateway": "oxapay",
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                    "completed": False,
                }

                success_base = success_url or self.allowed_origins[0]
                success_glue = "&" if "?" in success_base else "?"
                return_url = (
                    f"{success_base}{success_glue}checkout=success&payment_method=crypto"
                    f"&token={pending_token}"
                )

                order_id = str(order_payload.get("id") or pending_token)
                description = f"Order {order_id}"
                customer_email = str(session_user.get("email") or "").strip()
                oxapay_request_payload: dict[str, Any] = {
                    "merchant": self.oxapay_merchant_api_key,
                    "amount": round(computed_total, 2),
                    "currency": self.oxapay_currency,
                    "lifeTime": max(5, self.oxapay_lifetime_minutes),
                    "feePaidByPayer": 1,
                    "returnUrl": return_url,
                    "orderId": order_id,
                    "description": description,
                }
                if customer_email:
                    oxapay_request_payload["email"] = customer_email

                async with ClientSession() as session:
                    async with session.post(
                        f"{self.oxapay_api_url}/merchants/request",
                        json=oxapay_request_payload,
                    ) as oxapay_response:
                        try:
                            oxapay_payload = await oxapay_response.json(content_type=None)
                        except Exception:
                            raw_payload = await oxapay_response.text()
                            oxapay_payload = {"raw": raw_payload}
                        if oxapay_response.status >= 300:
                            logger.error(f"OxaPay invoice creation failed: {oxapay_payload}")
                            return web.json_response({"ok": False, "message": "failed to create OxaPay invoice"}, status=502)

                checkout_url = str(
                    oxapay_payload.get("payment_url")
                    or oxapay_payload.get("payLink")
                    or oxapay_payload.get("pay_link")
                    or ""
                ).strip()
                track_id = str(
                    oxapay_payload.get("track_id")
                    or oxapay_payload.get("trackId")
                    or ""
                ).strip()
                if not checkout_url:
                    oxa_message = str(oxapay_payload.get("message") or "").strip()
                    oxa_result = str(oxapay_payload.get("result") or "").strip()
                    logger.error(f"OxaPay invoice response missing checkout URL: {oxapay_payload}")
                    if oxa_message:
                        status = 400 if oxa_result in {"127", "400"} else 502
                        return web.json_response({"ok": False, "message": f"OxaPay: {oxa_message}"}, status=status)
                    return web.json_response({"ok": False, "message": "invalid OxaPay response"}, status=502)

                pending_entry = pending.get(pending_token, {})
                if isinstance(pending_entry, dict):
                    if track_id:
                        pending_entry["oxapayTrackId"] = track_id
                    pending_entry["oxapayRequest"] = {
                        "amount": round(computed_total, 2),
                        "currency": self.oxapay_currency,
                        "orderId": order_id,
                    }
                    pending[pending_token] = pending_entry
                    await self._save_pending_payments(pending)

                return web.json_response(
                    {
                        "ok": True,
                        "checkoutUrl": checkout_url,
                        "token": pending_token,
                        "trackId": track_id,
                        "manual": False,
                    }
                )

            if payment_method == "paypal":
                order_id_str = str(order_payload.get("id") or f"ord-{int(datetime.now(timezone.utc).timestamp())}")
                paypal_automated = bool(self.paypal_client_id and self.paypal_client_secret)
                if paypal_automated:
                    access_token = await self._get_paypal_access_token()
                    if not access_token:
                        return web.json_response({"ok": False, "message": "failed to authenticate with PayPal"}, status=502)

                    pending_token = secrets.token_urlsafe(24)
                    pending = await self._load_pending_payments()

                    success_base = success_url or self.allowed_origins[0]
                    cancel_base = cancel_url or self.allowed_origins[0]
                    success_glue = "&" if "?" in success_base else "?"
                    cancel_glue = "&" if "?" in cancel_base else "?"
                    return_url = f"{success_base}{success_glue}checkout=success&payment_method=paypal&token={pending_token}"
                    cancel_return_url = f"{cancel_base}{cancel_glue}checkout=cancel&payment_method=paypal"

                    paypal_order_body: dict[str, Any] = {
                        "intent": "CAPTURE",
                        "purchase_units": [
                            {
                                "reference_id": order_id_str,
                                "amount": {
                                    "currency_code": self.stripe_currency.upper() or "USD",
                                    "value": f"{computed_total:.2f}",
                                },
                                "description": f"Order {order_id_str}",
                            }
                        ],
                        "application_context": {
                            "return_url": return_url,
                            "cancel_url": cancel_return_url,
                            "user_action": "PAY_NOW",
                            "brand_name": "Roblox Keys",
                        },
                    }

                    async with ClientSession() as session:
                        async with session.post(
                            f"{self.paypal_api_base}/v2/checkout/orders",
                            json=paypal_order_body,
                            headers={
                                "Authorization": f"Bearer {access_token}",
                                "Content-Type": "application/json",
                                "Prefer": "return=representation",
                            },
                        ) as pp_resp:
                            try:
                                pp_data = await pp_resp.json(content_type=None)
                            except Exception:
                                pp_raw = await pp_resp.text()
                                pp_data = {"raw": pp_raw}
                            if pp_resp.status >= 300:
                                logger.error(f"PayPal order creation failed: {pp_data}")
                                return web.json_response({"ok": False, "message": "failed to create PayPal order"}, status=502)

                    paypal_order_id = str(pp_data.get("id") or "").strip()
                    approve_url = ""
                    for link in (pp_data.get("links") or []):
                        if isinstance(link, dict) and link.get("rel") == "approve":
                            approve_url = str(link.get("href") or "").strip()
                            break
                    if not approve_url:
                        for link in (pp_data.get("links") or []):
                            if isinstance(link, dict) and link.get("rel") == "payer-action":
                                approve_url = str(link.get("href") or "").strip()
                                break

                    if not approve_url or not paypal_order_id:
                        logger.error(f"PayPal order response missing approve URL: {pp_data}")
                        return web.json_response({"ok": False, "message": "invalid PayPal order response"}, status=502)

                    pending[pending_token] = {
                        "order": order_payload,
                        "user": session_user,
                        "paymentMethod": "paypal",
                        "gateway": "paypal",
                        "paypalOrderId": paypal_order_id,
                        "createdAt": datetime.now(timezone.utc).isoformat(),
                        "completed": False,
                    }
                    await self._save_pending_payments(pending)

                    return web.json_response(
                        {
                            "ok": True,
                            "checkoutUrl": approve_url,
                            "token": pending_token,
                            "paypalOrderId": paypal_order_id,
                            "manual": False,
                        }
                    )

                manual_checkout_url = await self._resolve_paypal_manual_checkout_url(
                    amount=computed_total,
                    order_id=order_id_str,
                )
                if not manual_checkout_url:
                    return web.json_response({"ok": False, "message": "PayPal is not configured"}, status=503)
                return web.json_response({"ok": True, "checkoutUrl": manual_checkout_url, "manual": True})

            if payment_method == "crypto":
                external_url = self.crypto_checkout_url
                if not external_url:
                    return web.json_response(
                        {"ok": False, "message": "crypto is not configured"},
                        status=400,
                    )
                query = urlencode({"amount": f"{computed_total:.2f}", "order_id": str(order_payload.get("id", ""))})
                glue = "&" if "?" in external_url else "?"
                return web.json_response({"ok": True, "checkoutUrl": f"{external_url}{glue}{query}", "manual": True})

        if not self.stripe_secret_key:
            return web.json_response({"ok": False, "message": "Stripe is not configured"}, status=503)

        items = order_payload.get("items", [])

        pending_token = secrets.token_urlsafe(24)
        pending = await self._load_pending_payments()
        pending[pending_token] = {
            "order": order_payload,
            "user": session_user,
            "paymentMethod": payment_method,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "completed": False,
        }
        await self._save_pending_payments(pending)

        success_base = success_url or self.allowed_origins[0]
        cancel_base = cancel_url or self.allowed_origins[0]
        success_glue = "&" if "?" in success_base else "?"
        cancel_glue = "&" if "?" in cancel_base else "?"
        stripe_success_url = (
            f"{success_base}{success_glue}checkout=success&payment_method=card"
            f"&token={pending_token}&session_id={{CHECKOUT_SESSION_ID}}"
        )
        stripe_cancel_url = f"{cancel_base}{cancel_glue}checkout=cancel&payment_method=card&token={pending_token}"

        form_data: list[tuple[str, str]] = [
            ("mode", "payment"),
            ("success_url", stripe_success_url),
            ("cancel_url", stripe_cancel_url),
            ("payment_method_types[]", "card"),
            ("metadata[token]", pending_token),
            ("metadata[order_id]", str(order_payload.get("id") or "")),
        ]

        for idx, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            quantity = max(1, self._to_int(item.get("quantity"), default=1) or 1)
            unit_amount = int(round((self._to_float(item.get("price"), default=0.0) or 0.0) * 100))
            if unit_amount <= 0:
                unit_amount = 1
            name = str(item.get("name") or f"Item {idx + 1}")[:120]
            form_data.extend(
                [
                    (f"line_items[{idx}][quantity]", str(quantity)),
                    (f"line_items[{idx}][price_data][currency]", self.stripe_currency),
                    (f"line_items[{idx}][price_data][unit_amount]", str(unit_amount)),
                    (f"line_items[{idx}][price_data][product_data][name]", name),
                ]
            )

        async with ClientSession() as session:
            async with session.post(
                "https://api.stripe.com/v1/checkout/sessions",
                data=form_data,
                headers={"Authorization": f"Bearer {self.stripe_secret_key}"},
            ) as stripe_response:
                stripe_payload = await stripe_response.json()
                if stripe_response.status >= 300:
                    logger.error(f"Stripe checkout session creation failed: {stripe_payload}")
                    return web.json_response({"ok": False, "message": "failed to create payment session"}, status=502)

        checkout_url = str(stripe_payload.get("url") or "").strip()
        session_id = str(stripe_payload.get("id") or "").strip()
        if not checkout_url or not session_id:
            return web.json_response({"ok": False, "message": "invalid payment session response"}, status=502)

        return web.json_response({"ok": True, "checkoutUrl": checkout_url, "token": pending_token, "sessionId": session_id})

    async def shop_confirm_payment(self, request: web.Request):
        auth_user = self._shop_user_from_request(request)
        if not isinstance(auth_user, dict):
            return web.json_response({"ok": False, "message": "unauthorized"}, status=401)

        payload = await self._safe_json(request)
        if payload is None:
            return web.json_response({"ok": False, "message": "invalid json body"}, status=400)

        token = str(payload.get("token", "")).strip()
        session_id = str(payload.get("sessionId", "")).strip()
        track_id = str(payload.get("trackId", "")).strip()
        requested_method = str(payload.get("paymentMethod", "")).strip().lower()
        if not token:
            return web.json_response({"ok": False, "message": "token is required"}, status=400)

        pending = await self._load_pending_payments()
        pending_entry = pending.get(token)
        if not isinstance(pending_entry, dict):
            return web.json_response({"ok": False, "message": "payment token not found"}, status=404)
        if pending_entry.get("completed"):
            return web.json_response({"ok": False, "message": "payment already processed"}, status=409)
        pending_user = pending_entry.get("user")
        pending_user_data = pending_user if isinstance(pending_user, dict) else {}
        pending_user_id = str(pending_user_data.get("id") or "").strip()
        pending_user_email = str(pending_user_data.get("email") or "").strip().lower()
        request_user_id = str(auth_user.get("id") or "").strip()
        request_user_email = str(auth_user.get("email") or "").strip().lower()
        if pending_user_id != request_user_id or pending_user_email != request_user_email:
            return web.json_response({"ok": False, "message": "payment token does not belong to this user"}, status=403)
        stored_method = str(pending_entry.get("paymentMethod", "")).strip().lower() or "card"
        if requested_method and requested_method != stored_method:
            return web.json_response({"ok": False, "message": "payment method mismatch"}, status=409)
        payment_method = stored_method

        if payment_method == "paypal":
            if not self.paypal_client_id or not self.paypal_client_secret:
                return web.json_response({"ok": False, "message": "PayPal is not configured"}, status=503)

            paypal_order_id = str(pending_entry.get("paypalOrderId") or payload.get("paypalOrderId") or "").strip()
            if not paypal_order_id:
                return web.json_response({"ok": False, "message": "paypalOrderId is required for PayPal verification"}, status=400)

            access_token = await self._get_paypal_access_token()
            if not access_token:
                return web.json_response({"ok": False, "message": "failed to authenticate with PayPal"}, status=502)

            async with ClientSession() as session:
                async with session.post(
                    f"{self.paypal_api_base}/v2/checkout/orders/{paypal_order_id}/capture",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json",
                        "Prefer": "return=representation",
                    },
                    json={},
                ) as capture_resp:
                    try:
                        capture_data = await capture_resp.json(content_type=None)
                    except Exception:
                        capture_raw = await capture_resp.text()
                        capture_data = {"raw": capture_raw}
                    if capture_resp.status >= 300:
                        logger.error(f"PayPal capture failed: {capture_data}")
                        pp_msg = ""
                        if isinstance(capture_data, dict):
                            details = capture_data.get("details") or []
                            if isinstance(details, list) and details:
                                pp_msg = str(details[0].get("description") or "").strip()
                        return web.json_response(
                            {"ok": False, "message": pp_msg or "PayPal capture failed"},
                            status=402 if capture_resp.status == 422 else 502,
                        )

            if not isinstance(capture_data, dict):
                return web.json_response({"ok": False, "message": "invalid PayPal capture response"}, status=502)

            pp_status = str(capture_data.get("status") or "").strip().upper()
            if pp_status != "COMPLETED":
                return web.json_response({"ok": False, "message": f"PayPal payment is {pp_status or 'pending'}"}, status=402)

            order_data = pending_entry.get("order", {})
            user_data = pending_entry.get("user", {})
            purchase = await self._process_purchase(
                order_data if isinstance(order_data, dict) else {},
                user_data if isinstance(user_data, dict) else {},
                payment_method,
            )
            if isinstance(purchase, web.Response):
                return purchase

            order_record, public_products = purchase
            pending_entry["completed"] = True
            pending_entry["completedAt"] = datetime.now(timezone.utc).isoformat()
            pending_entry["paypalOrderId"] = paypal_order_id
            pending_entry["paypalStatus"] = pp_status
            pending_entry["paypalCapture"] = capture_data
            pending[token] = pending_entry
            await self._save_pending_payments(pending)

            await self._send_order_log(order_record, user_data if isinstance(user_data, dict) else {}, payment_method)
            return web.json_response({"ok": True, "order": order_record, "products": public_products})

        if payment_method == "crypto":
            if not self.oxapay_merchant_api_key:
                return web.json_response({"ok": False, "message": "OxaPay is not configured"}, status=503)

            pending_track_id = str(pending_entry.get("oxapayTrackId") or "").strip()
            track_id = track_id or pending_track_id
            if not track_id:
                return web.json_response({"ok": False, "message": "trackId is required for crypto verification"}, status=400)
            if pending_track_id and pending_track_id != track_id:
                return web.json_response({"ok": False, "message": "trackId mismatch"}, status=409)

            async with ClientSession() as session:
                async with session.post(
                    f"{self.oxapay_api_url}/merchants/inquiry",
                    json={"merchant": self.oxapay_merchant_api_key, "trackId": track_id},
                ) as inquiry_response:
                    try:
                        inquiry_payload = await inquiry_response.json(content_type=None)
                    except Exception:
                        raw_payload = await inquiry_response.text()
                        inquiry_payload = {"raw": raw_payload}
                    if inquiry_response.status >= 300:
                        logger.error(f"OxaPay inquiry failed: {inquiry_payload}")
                        return web.json_response({"ok": False, "message": "failed to verify OxaPay payment"}, status=502)

            if not isinstance(inquiry_payload, dict):
                return web.json_response({"ok": False, "message": "invalid OxaPay inquiry response"}, status=502)
            payment_status = str(
                inquiry_payload.get("status")
                or inquiry_payload.get("paymentStatus")
                or ""
            ).strip().lower()
            if payment_status not in {"paid", "completed", "complete", "confirmed"}:
                return web.json_response({"ok": False, "message": f"crypto payment is {payment_status or 'pending'}"}, status=402)

            order_data = pending_entry.get("order", {})
            user_data = pending_entry.get("user", {})
            purchase = await self._process_purchase(
                order_data if isinstance(order_data, dict) else {},
                user_data if isinstance(user_data, dict) else {},
                payment_method,
            )
            if isinstance(purchase, web.Response):
                return purchase

            order_record, public_products = purchase
            pending_entry["completed"] = True
            pending_entry["completedAt"] = datetime.now(timezone.utc).isoformat()
            pending_entry["oxapayTrackId"] = track_id
            pending_entry["oxapayStatus"] = payment_status
            pending_entry["oxapayInquiry"] = inquiry_payload
            pending[token] = pending_entry
            await self._save_pending_payments(pending)

            await self._send_order_log(order_record, user_data if isinstance(user_data, dict) else {}, payment_method)
            return web.json_response({"ok": True, "order": order_record, "products": public_products})

        if not session_id:
            return web.json_response({"ok": False, "message": "sessionId is required for card verification"}, status=400)
        if not self.stripe_secret_key:
            return web.json_response({"ok": False, "message": "Stripe is not configured"}, status=503)

        async with ClientSession() as session:
            async with session.get(
                f"https://api.stripe.com/v1/checkout/sessions/{session_id}",
                headers={"Authorization": f"Bearer {self.stripe_secret_key}"},
            ) as stripe_response:
                stripe_payload = await stripe_response.json()
                if stripe_response.status >= 300:
                    logger.error(f"Stripe payment confirmation failed: {stripe_payload}")
                    return web.json_response({"ok": False, "message": "failed to verify payment"}, status=502)

        payment_status = str(stripe_payload.get("payment_status") or "").strip().lower()
        metadata = stripe_payload.get("metadata", {})
        metadata_token = ""
        if isinstance(metadata, dict):
            metadata_token = str(metadata.get("token") or "").strip()

        if payment_status != "paid":
            return web.json_response({"ok": False, "message": "payment is not completed"}, status=402)
        if metadata_token and metadata_token != token:
            return web.json_response({"ok": False, "message": "payment token mismatch"}, status=409)

        order_data = pending_entry.get("order", {})
        user_data = pending_entry.get("user", {})
        payment_method = str(pending_entry.get("paymentMethod", "card"))

        purchase = await self._process_purchase(
            order_data if isinstance(order_data, dict) else {},
            user_data if isinstance(user_data, dict) else {},
            payment_method,
        )
        if isinstance(purchase, web.Response):
            return purchase

        order_record, public_products = purchase
        pending_entry["completed"] = True
        pending_entry["completedAt"] = datetime.now(timezone.utc).isoformat()
        pending_entry["stripeSessionId"] = session_id
        pending[token] = pending_entry
        await self._save_pending_payments(pending)

        await self._send_order_log(order_record, user_data if isinstance(user_data, dict) else {}, payment_method)
        return web.json_response({"ok": True, "order": order_record, "products": public_products})

    async def _process_purchase(
        self,
        order_data: dict[str, Any],
        user_data: dict[str, Any],
        payment_method: str,
    ) -> tuple[dict[str, Any], list[dict[str, Any]]] | web.Response:
        items = order_data.get("items", [])
        if not isinstance(items, list) or not items:
            return web.json_response({"ok": False, "message": "order items are required"}, status=400)

        products = await self._load_products()
        order_id = str(order_data.get("id") or "").strip()
        existing_orders = await self._load_orders()
        if order_id:
            for existing_order in existing_orders:
                if str(existing_order.get("id") or "").strip() == order_id:
                    existing_user_id = str(existing_order.get("userId") or "").strip()
                    existing_user_payload = existing_order.get("user")
                    existing_user = existing_user_payload if isinstance(existing_user_payload, dict) else {}
                    existing_email = str(existing_user.get("email") or "").strip().lower()
                    current_user_id = str(user_data.get("id") or "").strip()
                    current_email = str(user_data.get("email") or "").strip().lower()
                    same_owner = bool(
                        (current_user_id and existing_user_id == current_user_id)
                        or (current_email and existing_email == current_email)
                    )
                    if same_owner:
                        # Idempotent confirmation for same authenticated user.
                        return existing_order, [self._public_product(product) for product in products]
                    return web.json_response({"ok": False, "message": "duplicate order id"}, status=409)

        products_by_id = {str(product.get("id")): dict(product) for product in products}
        credentials: dict[str, str] = {}

        for item in items:
            if not isinstance(item, dict):
                return web.json_response({"ok": False, "message": "invalid order item"}, status=400)
            item_id = str(item.get("productId") or item.get("id") or "").strip()
            if not str(item.get("productId") or "").strip() and "::" in item_id:
                item_id = item_id.split("::", 1)[0].strip()
            tier_id = str(item.get("tierId") or "").strip()
            quantity = self._to_int(item.get("quantity"), default=0) or 0
            if not item_id or quantity <= 0:
                return web.json_response({"ok": False, "message": "invalid item id or quantity"}, status=400)
            product = products_by_id.get(item_id)
            if product is None:
                return web.json_response({"ok": False, "message": f"product {item_id} not found"}, status=404)
            if tier_id:
                tier = self._find_tier(product, tier_id)
                if tier is None:
                    return web.json_response({"ok": False, "message": f"tier {tier_id} not found for {item_id}"}, status=404)
                inventory = [str(entry).strip() for entry in tier.get("inventory", []) if str(entry).strip()]
                if len(inventory) < quantity:
                    return web.json_response(
                        {
                            "ok": False,
                            "message": f"not enough deliverable stock for {product.get('name', item_id)} - {tier.get('name', tier_id)}.",
                            "productId": item_id,
                            "tierId": tier_id,
                        },
                        status=409,
                    )
            else:
                inventory = [str(entry).strip() for entry in product.get("inventory", []) if str(entry).strip()]
                if len(inventory) < quantity:
                    return web.json_response(
                        {
                            "ok": False,
                            "message": f"not enough deliverable stock for {product.get('name', item_id)}. Add stock keys in admin.",
                            "productId": item_id,
                        },
                        status=409,
                    )

        for item in items:
            line_id = str(item.get("id") or "").strip()
            item_id = str(item.get("productId") or item.get("id") or "").strip()
            if not str(item.get("productId") or "").strip() and "::" in item_id:
                item_id = item_id.split("::", 1)[0].strip()
            tier_id = str(item.get("tierId") or "").strip()
            quantity = self._to_int(item.get("quantity"), default=0) or 0
            product = products_by_id[item_id]
            if tier_id:
                tier = self._find_tier(product, tier_id)
                if tier is None:
                    return web.json_response({"ok": False, "message": f"tier {tier_id} not found for {item_id}"}, status=404)
                inventory = [str(entry).strip() for entry in tier.get("inventory", []) if str(entry).strip()]
                delivered = inventory[:quantity]
                remaining = inventory[quantity:]
                tier["inventory"] = remaining
                tier["stock"] = len(remaining)
                product["stock"] = self._compute_product_stock(product)
            else:
                inventory = [str(entry).strip() for entry in product.get("inventory", []) if str(entry).strip()]
                delivered = inventory[:quantity]
                remaining = inventory[quantity:]
                product["inventory"] = remaining
                product["stock"] = len(remaining)
            credential_key = line_id or (f"{item_id}::{tier_id}" if tier_id else item_id)
            credentials[credential_key] = "\n".join(delivered)

        normalized_products = [self._normalize_product(product) for product in products_by_id.values()]
        await self._save_products(normalized_products)

        safe_user_data = {
            "id": str(user_data.get("id") or "").strip(),
            "email": str(user_data.get("email") or "").strip().lower(),
            "role": "admin" if str(user_data.get("role") or "").strip().lower() == "admin" else "user",
            "createdAt": str(user_data.get("createdAt") or "").strip(),
            "discordId": str(user_data.get("discordId") or "").strip(),
            "discordUsername": str(user_data.get("discordUsername") or "").strip(),
            "discordAvatar": str(user_data.get("discordAvatar") or "").strip(),
            "discordLinkedAt": str(user_data.get("discordLinkedAt") or "").strip(),
        }
        order_total = round(
            sum(
                (self._to_float(item.get("price"), default=0.0) or 0.0)
                * max(1, self._to_int(item.get("quantity"), default=1) or 1)
                for item in items
                if isinstance(item, dict)
            ),
            2,
        )

        order_record = {
            "id": str(order_data.get("id") or f"ord-{int(datetime.now(timezone.utc).timestamp())}"),
            "userId": str(safe_user_data.get("id") or safe_user_data.get("email") or "guest"),
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "paymentMethod": payment_method,
            "user": safe_user_data,
            "items": items,
            "total": order_total,
            "status": "completed",
            "credentials": credentials,
        }
        orders = existing_orders
        orders.append(order_record)
        await self._save_orders(orders)
        try:
            await self._send_purchase_email(order_record)
        except Exception as exc:
            logger.error(f"Failed to send purchase email for {order_record.get('id', 'N/A')}: {exc}")

        return order_record, [self._public_product(product) for product in normalized_products]

    async def chat(self, request: web.Request):
        payload = await self._safe_json(request)
        if payload is None:
            return web.json_response({"ok": False, "message": "invalid json body"}, status=400)

        message = str(payload.get("message", "")).strip()
        products = payload.get("products", [])
        if not message:
            return web.json_response({"ok": False, "message": "message is required"}, status=400)
        if not isinstance(products, list):
            products = []

        reply = self._build_reply(message, products)
        dispatched = await self._send_chat_log(message, reply)

        return web.json_response({"ok": True, "reply": reply, "dispatched": dispatched})

    async def order(self, request: web.Request):
        payload = await self._safe_json(request)
        if payload is None:
            return web.json_response({"ok": False, "message": "invalid json body"}, status=400)

        order_data = payload.get("order", payload)
        user_data = payload.get("user", {})
        payment_method = str(payload.get("paymentMethod", "")).strip()
        if not isinstance(order_data, dict):
            return web.json_response({"ok": False, "message": "order payload is required"}, status=400)
        if not isinstance(user_data, dict):
            user_data = {}

        dispatched = await self._send_order_log(order_data, user_data, payment_method)
        return web.json_response({"ok": True, "dispatched": dispatched})

    async def _safe_json(self, request: web.Request) -> Optional[dict[str, Any]]:
        try:
            body = await request.json()
        except Exception:
            return None
        if not isinstance(body, dict):
            return None
        return body

    def _is_resend_ready(self) -> bool:
        return bool(self.resend_api_key and self.resend_from_email)

    def _is_smtp_ready(self) -> bool:
        return bool(self.smtp_host and self.smtp_from_email)

    def _is_login_2fa_ready(self) -> bool:
        if not self.login_2fa_enabled:
            return False
        if self.email_provider == "resend":
            return self._is_resend_ready()
        if self.email_provider == "smtp":
            return self._is_smtp_ready()
        return self._is_resend_ready() or self._is_smtp_ready()

    @staticmethod
    def _is_password_hash(value: str) -> bool:
        return str(value or "").startswith("pbkdf2_sha256$")

    def _hash_password(self, password: str, *, iterations: int = 210_000) -> str:
        salt = secrets.token_hex(16)
        derived = hashlib.pbkdf2_hmac(
            "sha256",
            str(password or "").encode("utf-8"),
            salt.encode("utf-8"),
            iterations,
        )
        digest = self._b64url_encode(derived)
        return f"pbkdf2_sha256${iterations}${salt}${digest}"

    def _verify_password(self, password: str, stored: str) -> bool:
        candidate = str(password or "")
        hashed = str(stored or "").strip()
        if not hashed:
            return False
        if not self._is_password_hash(hashed):
            return hmac.compare_digest(candidate, hashed)
        parts = hashed.split("$", 3)
        if len(parts) != 4:
            return False
        _, raw_iterations, salt, expected_digest = parts
        iterations = self._to_int(raw_iterations, default=210_000) or 210_000
        derived = hashlib.pbkdf2_hmac(
            "sha256",
            candidate.encode("utf-8"),
            salt.encode("utf-8"),
            iterations,
        )
        actual_digest = self._b64url_encode(derived)
        return hmac.compare_digest(actual_digest, expected_digest)

    def _purge_expired_login_otps(self) -> None:
        now = datetime.now(timezone.utc)
        stale_tokens: list[str] = []
        for token, row in self.login_otp_sessions.items():
            if not isinstance(row, dict):
                stale_tokens.append(token)
                continue
            expires_at = str(row.get("expiresAt", "")).strip()
            if not expires_at:
                stale_tokens.append(token)
                continue
            try:
                expiry = datetime.fromisoformat(expires_at)
            except ValueError:
                stale_tokens.append(token)
                continue
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            if expiry <= now:
                stale_tokens.append(token)
        for token in stale_tokens:
            self.login_otp_sessions.pop(token, None)

    @staticmethod
    def _email_escape(value: Any) -> str:
        return html.escape(str(value or ""), quote=True)

    @staticmethod
    def _format_email_datetime(value: str) -> str:
        raw = str(value or "").strip()
        if not raw:
            return datetime.now(timezone.utc).strftime("%b %d, %Y %H:%M UTC")
        try:
            parsed = datetime.fromisoformat(raw)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            parsed = parsed.astimezone(timezone.utc)
            return parsed.strftime("%b %d, %Y %H:%M UTC")
        except ValueError:
            return raw

    def _build_email_shell(self, preheader: str, body_html: str) -> str:
        brand_name = self._email_escape(self.resend_from_name or self.smtp_from_name or "Roblox Keys")
        preheader_text = self._email_escape(preheader)
        return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{brand_name}</title>
  <style>
    body {{
      margin: 0;
      padding: 0;
      background: #050505;
      color: #ffffff;
      font-family: Inter, Segoe UI, Helvetica Neue, Arial, sans-serif;
    }}
    .mail-bg {{
      width: 100%;
      height: 900px;
      min-height: 900px;
      background:
        radial-gradient(circle at 12% 8%, rgba(250, 204, 21, 0.24), transparent 42%),
        radial-gradient(circle at 88% 96%, rgba(250, 204, 21, 0.14), transparent 42%),
        repeating-linear-gradient(
          0deg,
          rgba(250, 204, 21, 0.08) 0,
          rgba(250, 204, 21, 0.08) 1px,
          transparent 1px,
          transparent 36px
        ),
        repeating-linear-gradient(
          90deg,
          rgba(250, 204, 21, 0.08) 0,
          rgba(250, 204, 21, 0.08) 1px,
          transparent 1px,
          transparent 36px
        ),
        #050505;
      display: table;
      table-layout: fixed;
    }}
    .mail-bg-cell {{
      display: table-cell;
      vertical-align: middle;
      text-align: center;
      padding: 28px 14px;
    }}
    .mail-wrap {{
      width: 100%;
      max-width: 1280px;
      margin: 0 auto;
      padding: 0 18px;
      text-align: center;
    }}
    .mail-card {{
      display: inline-block;
      width: 100%;
      max-width: 1080px;
      margin: 0 auto;
      min-height: auto;
      border-radius: 22px;
      border: 1px solid rgba(250, 204, 21, 0.25);
      background: linear-gradient(180deg, #0a0a0a 0%, #070707 100%);
      box-shadow:
        0 20px 55px rgba(0, 0, 0, 0.66),
        0 0 0 1px rgba(250, 204, 21, 0.08) inset;
      overflow: hidden;
      text-align: left;
    }}
    .mail-header {{
      padding: 34px 42px 24px;
      border-bottom: 1px solid rgba(250, 204, 21, 0.18);
      background: linear-gradient(120deg, rgba(250, 204, 21, 0.2), rgba(0, 0, 0, 0));
    }}
    .brand-chip {{
      display: inline-block;
      padding: 7px 12px;
      border-radius: 999px;
      border: 1px solid rgba(250, 204, 21, 0.35);
      background: rgba(250, 204, 21, 0.11);
      color: #facc15;
      font-size: 11px;
      letter-spacing: 0.2em;
      font-weight: 800;
      text-transform: uppercase;
    }}
    .mail-body {{
      padding: 34px 42px 38px;
      color: #f8f8f8;
    }}
    .mail-footer {{
      margin-top: 26px;
      padding-top: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.62);
      font-size: 12px;
      line-height: 1.6;
    }}
    .panel {{
      margin-top: 14px;
      border-radius: 16px;
      border: 1px solid rgba(250, 204, 21, 0.25);
      background: linear-gradient(90deg, rgba(250, 204, 21, 0.11), rgba(250, 204, 21, 0.02));
      padding: 14px 16px;
    }}
    .muted {{
      color: rgba(255, 255, 255, 0.64);
    }}
    .accent {{
      color: #facc15;
    }}
    .otp-code {{
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 14px;
      border-radius: 16px;
      border: 1px solid rgba(250, 204, 21, 0.35);
      background: #0a0a0a;
      color: #facc15;
      font-size: 46px;
      line-height: 1.15;
      letter-spacing: 0.28em;
      font-weight: 900;
      text-align: center;
      padding: 18px 12px;
      box-shadow: 0 0 35px rgba(250, 204, 21, 0.15) inset;
    }}
    .order-row {{
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding: 11px 0;
    }}
    .order-row:first-child {{
      border-top: 0;
      padding-top: 0;
    }}
    .label {{
      color: rgba(255, 255, 255, 0.58);
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-weight: 700;
    }}
    .value {{
      color: #ffffff;
      font-size: 15px;
      font-weight: 700;
    }}
    .credential-block {{
      margin-top: 12px;
      border: 1px solid rgba(250, 204, 21, 0.22);
      border-radius: 12px;
      background: rgba(0, 0, 0, 0.6);
      padding: 12px;
      font-family: Consolas, Menlo, Monaco, monospace;
      font-size: 13px;
      line-height: 1.55;
      white-space: pre-wrap;
      color: #f5f5f5;
    }}
    @media (max-width: 640px) {{
      .mail-bg {{
        height: auto;
        min-height: 0;
      }}
      .mail-bg-cell {{
        padding: 16px 6px;
      }}
      .mail-header, .mail-body {{
        padding-left: 18px;
        padding-right: 18px;
      }}
      .mail-wrap {{
        padding: 0 2px;
      }}
      .mail-card {{
        min-height: auto;
        border-radius: 16px;
      }}
      .otp-code {{
        font-size: 31px;
        letter-spacing: 0.2em;
      }}
    }}
  </style>
</head>
<body>
  <div style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">{preheader_text}</div>
  <div class="mail-bg">
    <div class="mail-bg-cell">
      <div class="mail-wrap">
        <div class="mail-card">
          <div class="mail-header">
            <span class="brand-chip">{brand_name}</span>
          </div>
          <div class="mail-body">
            {body_html}
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>"""

    def _build_login_otp_html(self, brand_name: str, otp_code: str, ttl_minutes: int) -> str:
        safe_brand = self._email_escape(brand_name)
        safe_code = self._email_escape(otp_code)
        safe_minutes = self._email_escape(ttl_minutes)
        content = f"""
<h1 style="margin:0;font-size:44px;line-height:1.02;letter-spacing:-0.02em;">Welcome Back</h1>
<p class="muted" style="margin:10px 0 0;font-size:14px;">
  Use this one-time code to verify your sign in to <span class="accent">{safe_brand}</span>.
</p>
<div class="otp-code">{safe_code}</div>
<div class="panel">
  <div class="label">Security Window</div>
  <div class="value">Code expires in {safe_minutes} minute(s)</div>
</div>
<div class="mail-footer">
  If you did not request this login, you can safely ignore this email.
</div>
"""
        return self._build_email_shell(
            f"{safe_brand} verification code: {safe_code}",
            content,
        )

    def _build_purchase_html(
        self,
        brand_name: str,
        order_id: str,
        created_at: str,
        total: str,
        payment_method: str,
        item_rows: list[dict[str, str]],
        credential_rows: list[dict[str, str]],
    ) -> str:
        safe_brand = self._email_escape(brand_name)
        safe_order_id = self._email_escape(order_id)
        safe_created = self._email_escape(self._format_email_datetime(created_at))
        safe_total = self._email_escape(total)
        safe_payment = self._email_escape(payment_method or "N/A")

        items_html = ""
        if item_rows:
            rows: list[str] = []
            for row in item_rows:
                name = self._email_escape(row.get("name"))
                qty = self._email_escape(row.get("qty"))
                price = self._email_escape(row.get("price"))
                rows.append(
                    f"""<div class="order-row">
  <div class="value">{name}</div>
  <div class="muted" style="font-size:13px;">Qty: {qty} • {price}</div>
</div>"""
                )
            items_html = "".join(rows)
        else:
            items_html = '<div class="muted" style="font-size:13px;">No line items.</div>'

        creds_html = ""
        if credential_rows:
            blocks: list[str] = []
            for row in credential_rows:
                line_id = self._email_escape(row.get("line_id"))
                value = self._email_escape(row.get("value"))
                blocks.append(
                    f"""<div style="margin-top:10px;">
  <div class="label" style="margin-bottom:6px;">{line_id}</div>
  <div class="credential-block">{value}</div>
</div>"""
                )
            creds_html = "".join(blocks)
        else:
            creds_html = '<div class="muted" style="font-size:13px;">No credentials attached.</div>'

        content = f"""
<h1 style="margin:0;font-size:42px;line-height:1.02;letter-spacing:-0.02em;">Order Confirmed</h1>
<p class="muted" style="margin:10px 0 0;font-size:14px;">
  Thanks for shopping with <span class="accent">{safe_brand}</span>. Your digital order is now delivered.
</p>

<div class="panel" style="margin-top:16px;">
  <div class="label">Order ID</div>
  <div class="value">{safe_order_id}</div>
  <div style="height:10px;"></div>
  <div class="label">Date</div>
  <div class="value">{safe_created}</div>
  <div style="height:10px;"></div>
  <div class="label">Payment Method</div>
  <div class="value">{safe_payment}</div>
  <div style="height:10px;"></div>
  <div class="label">Total</div>
  <div class="value" style="color:#facc15;font-size:24px;">{safe_total}</div>
</div>

<div style="margin-top:20px;">
  <div class="label">Items</div>
  <div style="margin-top:10px;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px;background:rgba(255,255,255,0.02);">
    {items_html}
  </div>
</div>

<div style="margin-top:20px;">
  <div class="label">Delivered Credentials</div>
  {creds_html}
</div>

<div class="mail-footer">
  Need help? Contact support and include your order ID: <span class="accent">{safe_order_id}</span>.
</div>
"""
        return self._build_email_shell(
            f"{safe_brand} order {safe_order_id} confirmed",
            content,
        )

    async def _send_login_otp_email(self, email: str, otp_code: str) -> bool:
        ttl_minutes = max(1, self.login_otp_ttl_seconds // 60)
        brand_name = self.resend_from_name or self.smtp_from_name or "Roblox Keys"
        subject = f"{brand_name} Login Verification Code"
        body = (
            f"Your login verification code is: {otp_code}\n\n"
            f"This code expires in {ttl_minutes} minute(s).\n"
            "If you did not request this login, you can ignore this email."
        )
        html_body = self._build_login_otp_html(brand_name, otp_code, ttl_minutes)
        return await self._send_email(email, subject, body, html_body=html_body)

    async def _send_purchase_email(self, order_record: dict[str, Any]) -> bool:
        user_data = order_record.get("user")
        email = ""
        if isinstance(user_data, dict):
            email = str(user_data.get("email", "")).strip().lower()
        if not email:
            return False

        order_id = str(order_record.get("id") or "N/A")
        total = self._format_price(order_record.get("total"))
        created_at = str(order_record.get("createdAt") or datetime.now(timezone.utc).isoformat())
        items = order_record.get("items", [])
        credentials = order_record.get("credentials", {})

        item_lines: list[str] = []
        item_rows: list[dict[str, str]] = []
        if isinstance(items, list):
            for item in items:
                if not isinstance(item, dict):
                    continue
                name = str(item.get("name") or item.get("id") or "Item").strip()
                qty = max(1, self._to_int(item.get("quantity"), default=1) or 1)
                price = self._to_float(item.get("price"), default=0.0) or 0.0
                item_lines.append(f"- {name} x{qty} (${price:.2f})")
                item_rows.append(
                    {
                        "name": name,
                        "qty": str(qty),
                        "price": f"${price:.2f}",
                    }
                )

        credential_lines: list[str] = []
        credential_rows: list[dict[str, str]] = []
        if isinstance(credentials, dict):
            for line_id, raw in credentials.items():
                value = str(raw or "").strip()
                if not value:
                    continue
                credential_lines.append(f"{line_id}:\n{value}")
                credential_rows.append({"line_id": str(line_id), "value": value})

        details = "\n".join(item_lines) if item_lines else "- (No line items)"
        credentials_text = "\n\n".join(credential_lines) if credential_lines else "No credentials attached."
        brand_name = self.resend_from_name or self.smtp_from_name or "Roblox Keys"
        subject = f"{brand_name} Order Confirmation ({order_id})"
        body = (
            f"Thanks for your purchase.\n\n"
            f"Order ID: {order_id}\n"
            f"Date: {created_at}\n"
            f"Total: {total}\n\n"
            f"Items:\n{details}\n\n"
            f"Delivered Credentials:\n{credentials_text}\n\n"
            "If you need support, contact us with your order ID."
        )
        html_body = self._build_purchase_html(
            brand_name=brand_name,
            order_id=order_id,
            created_at=created_at,
            total=total,
            payment_method=str(order_record.get("paymentMethod") or "").strip(),
            item_rows=item_rows,
            credential_rows=credential_rows,
        )
        sent = await self._send_email(email, subject, body, html_body=html_body)
        if sent:
            logger.info(f"Purchase confirmation email sent for order {order_id} to {email}")
        return sent

    async def _send_email(self, to_email: str, subject: str, body: str, html_body: Optional[str] = None) -> bool:
        recipient = str(to_email or "").strip()
        if not recipient:
            return False
        if self.email_provider == "resend":
            return await self._send_email_via_resend(recipient, subject, body, html_body=html_body)

        if self.email_provider == "smtp":
            return await self._send_email_via_smtp(recipient, subject, body, html_body=html_body)

        # auto: prefer Resend (HTTPS) on hosted runtimes, fallback to SMTP
        if self._is_resend_ready():
            sent = await self._send_email_via_resend(recipient, subject, body, html_body=html_body)
            if sent:
                return True
        if self._is_smtp_ready():
            return await self._send_email_via_smtp(recipient, subject, body, html_body=html_body)
        return False

    async def _send_email_via_resend(
        self,
        recipient: str,
        subject: str,
        body: str,
        html_body: Optional[str] = None,
    ) -> bool:
        if not self._is_resend_ready():
            return False

        sender_name = self.resend_from_name or self.smtp_from_name or "Roblox Keys"
        sender_email = self.resend_from_email
        payload: dict[str, Any] = {
            "from": f"{sender_name} <{sender_email}>",
            "to": [recipient],
            "subject": subject,
            "text": body,
        }
        if html_body:
            payload["html"] = html_body
        if self.resend_reply_to:
            payload["reply_to"] = self.resend_reply_to

        headers = {
            "Authorization": f"Bearer {self.resend_api_key}",
            "Content-Type": "application/json",
        }

        try:
            timeout = ClientTimeout(total=20)
            async with ClientSession(timeout=timeout) as session:
                async with session.post(self.resend_api_url, headers=headers, json=payload) as response:
                    if 200 <= response.status < 300:
                        return True
                    details = (await response.text())[:500]
                    logger.error(
                        f"Resend send failed for {recipient}: status={response.status} response={details}"
                    )
                    return False
        except Exception as exc:
            logger.error(f"Resend send failed for {recipient}: {exc}")
            return False

    async def _send_email_via_smtp(
        self,
        recipient: str,
        subject: str,
        body: str,
        html_body: Optional[str] = None,
    ) -> bool:
        if not self._is_smtp_ready():
            return False

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = f"{self.smtp_from_name} <{self.smtp_from_email}>"
        message["To"] = recipient
        message.set_content(body)
        if html_body:
            message.add_alternative(html_body, subtype="html")

        def _deliver():
            context = ssl.create_default_context()
            if self.smtp_use_ssl:
                with smtplib.SMTP_SSL(self.smtp_host, self.smtp_port, timeout=20, context=context) as client:
                    if self.smtp_user and self.smtp_password:
                        client.login(self.smtp_user, self.smtp_password)
                    client.send_message(message)
                return

            with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=20) as client:
                if self.smtp_use_tls:
                    client.starttls(context=context)
                if self.smtp_user and self.smtp_password:
                    client.login(self.smtp_user, self.smtp_password)
                client.send_message(message)

        try:
            await asyncio.to_thread(_deliver)
            return True
        except Exception as exc:
            logger.error(f"SMTP send failed for {recipient}: {exc}")
            return False

    def _state_storage_key(self, state_key: str) -> str:
        return f"state:{state_key}"

    def _state_file(self, state_key: str) -> Path:
        return self.data_dir / f"shop_state_{state_key}.json"

    def _is_state_key_allowed(self, state_key: str) -> bool:
        return state_key in self.state_keys

    def _default_state_value(self, state_key: str) -> Any:
        defaults: dict[str, Any] = {
            "settings": {
                "storeName": os.getenv("BRAND_NAME", "Roblox Keys"),
                "logoUrl": self.brand_logo_url,
                "bannerUrl": self.brand_banner_url,
                "faviconUrl": self.brand_favicon_url,
                "currency": "USD",
                "paypalEmail": "",
                "stripeKey": "",
                "cryptoAddress": "",
            },
            "users": [
                {
                    "id": "admin-1337",
                    "email": self.admin_email,
                    "password": self.bootstrap_admin_password_hash,
                    "role": "admin",
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                    "discordId": "",
                    "discordUsername": "",
                    "discordAvatar": "",
                    "discordLinkedAt": "",
                }
            ],
            "logs": [
                {
                    "id": "log-boot",
                    "event": "System core initialized",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "status": "SUCCESS",
                    "ip": "127.0.0.1",
                }
            ],
            "categories": [],
            "groups": [],
            "coupons": [],
            "invoices": [],
            "tickets": [],
            "feedbacks": [],
            "domains": [],
            "team": [],
            "blacklist": [],
            "payment_methods": [
                {"id": "pm-card", "name": "Card", "enabled": True, "instructions": "Stripe/Card checkout"},
                {"id": "pm-paypal", "name": "PayPal", "enabled": True, "instructions": "PayPal email checkout"},
                {"id": "pm-crypto", "name": "Crypto", "enabled": True, "instructions": "Manual wallet transfer"},
            ],
        }
        value = defaults.get(state_key, [])
        return json.loads(json.dumps(value))

    def _extract_branding_from_settings(self, settings: dict[str, Any]) -> dict[str, str]:
        store_name = str(settings.get("storeName") or os.getenv("BRAND_NAME") or "Roblox Keys").strip() or "Roblox Keys"
        logo_url = str(settings.get("logoUrl") or self.brand_logo_url or "").strip()
        banner_url = str(settings.get("bannerUrl") or self.brand_banner_url or "").strip()
        favicon_url = str(settings.get("faviconUrl") or logo_url or self.brand_favicon_url or "").strip()
        return {
            "storeName": store_name,
            "logoUrl": logo_url,
            "bannerUrl": banner_url,
            "faviconUrl": favicon_url,
        }

    async def _load_state(self, state_key: str) -> Any:
        if not self._is_state_key_allowed(state_key):
            return self._default_state_value(state_key)

        expected = self._default_state_value(state_key)
        if self.use_supabase_storage and self.pg_pool is not None:
            data = await self._db_get_json(self._state_storage_key(state_key), default=None)
        else:
            data = self._read_json(self._state_file(state_key), default=None)

        if data is None:
            data = expected

        if isinstance(expected, list) and not isinstance(data, list):
            data = expected
        elif isinstance(expected, dict) and not isinstance(data, dict):
            data = expected

        if state_key == "users" and isinstance(data, list):
            users = self._ensure_default_admin_user([item for item in data if isinstance(item, dict)])
            if json.dumps(users, sort_keys=True) != json.dumps(data, sort_keys=True):
                await self._save_state("users", users)
            data = users
        elif state_key == "invoices" and isinstance(data, list):
            orders = await self._load_orders()
            synced = self._sync_invoices_with_orders([item for item in data if isinstance(item, dict)], orders)
            if json.dumps(synced, sort_keys=True) != json.dumps(data, sort_keys=True):
                await self._save_state("invoices", synced)
            data = synced

        return data

    async def _save_state(self, state_key: str, value: Any) -> None:
        if not self._is_state_key_allowed(state_key):
            return

        if state_key == "users" and isinstance(value, list):
            value = self._ensure_default_admin_user([item for item in value if isinstance(item, dict)])
        elif state_key == "logs" and isinstance(value, list):
            value = [item for item in value if isinstance(item, dict)][:100]
        elif state_key == "invoices" and isinstance(value, list):
            orders = await self._load_orders()
            value = self._sync_invoices_with_orders([item for item in value if isinstance(item, dict)], orders)

        if self.use_supabase_storage and self.pg_pool is not None:
            await self._db_set_json(self._state_storage_key(state_key), value)
            return

        self._write_json(self._state_file(state_key), value)

    def _ensure_default_admin_user(self, users: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        admin_found = False

        for user in users:
            email = str(user.get("email", "")).strip().lower()
            if not email:
                continue
            role = str(user.get("role") or "user").strip().lower()
            raw_password = str(user.get("password") or "").strip()
            if raw_password and not self._is_password_hash(raw_password):
                normalized_password = self._hash_password(raw_password)
            else:
                normalized_password = raw_password
            normalized_user = {
                "id": str(user.get("id") or f"user-{int(datetime.now(timezone.utc).timestamp() * 1000)}"),
                "email": email,
                "password": normalized_password,
                "role": "admin" if role == "admin" else "user",
                "createdAt": str(user.get("createdAt") or datetime.now(timezone.utc).isoformat()),
                "discordId": str(user.get("discordId") or "").strip(),
                "discordUsername": str(user.get("discordUsername") or "").strip(),
                "discordAvatar": str(user.get("discordAvatar") or "").strip(),
                "discordLinkedAt": str(user.get("discordLinkedAt") or "").strip(),
            }
            if email == self.admin_email:
                normalized_user["id"] = str(user.get("id") or "admin-1337")
                if self.admin_password_configured:
                    if self._is_password_hash(raw_password) and self._verify_password(self.admin_password, raw_password):
                        normalized_user["password"] = raw_password
                    else:
                        normalized_user["password"] = self._hash_password(self.admin_password)
                elif normalized_password:
                    normalized_user["password"] = normalized_password
                else:
                    normalized_user["password"] = self.bootstrap_admin_password_hash
                normalized_user["role"] = "admin"
                admin_found = True
            normalized.append(normalized_user)

        if not admin_found:
            normalized.insert(
                0,
                {
                    "id": "admin-1337",
                    "email": self.admin_email,
                    "password": (
                        self._hash_password(self.admin_password)
                        if self.admin_password_configured
                        else self.bootstrap_admin_password_hash
                    ),
                    "role": "admin",
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                    "discordId": "",
                    "discordUsername": "",
                    "discordAvatar": "",
                    "discordLinkedAt": "",
                },
            )
        return normalized

    def _is_discord_oauth_ready(self) -> bool:
        return bool(
            self.discord_oauth_client_id
            and self.discord_oauth_client_secret
            and self.discord_oauth_redirect_uri
        )

    def _issue_discord_link_token(self, user: dict[str, Any]) -> str:
        self._purge_expired_discord_link_tokens()
        token = secrets.token_urlsafe(24)
        self.discord_link_tokens[token] = {
            "userId": str(user.get("id") or "").strip(),
            "email": str(user.get("email") or "").strip().lower(),
            "expiresAt": (datetime.now(timezone.utc) + timedelta(seconds=self.discord_link_token_ttl_seconds)).isoformat(),
        }
        return token

    def _purge_expired_discord_link_tokens(self) -> None:
        now = datetime.now(timezone.utc)
        expired_tokens: list[str] = []
        for token, row in self.discord_link_tokens.items():
            expires_raw = str(row.get("expiresAt") or "").strip()
            if not expires_raw:
                expired_tokens.append(token)
                continue
            try:
                expires_at = datetime.fromisoformat(expires_raw)
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
            except Exception:
                expired_tokens.append(token)
                continue
            if expires_at <= now:
                expired_tokens.append(token)
        for token in expired_tokens:
            self.discord_link_tokens.pop(token, None)

    def _purge_expired_discord_oauth_states(self) -> None:
        now = datetime.now(timezone.utc)
        expired_states: list[str] = []
        for state, row in self.discord_oauth_states.items():
            expires_raw = str(row.get("expiresAt") or "").strip()
            if not expires_raw:
                expired_states.append(state)
                continue
            try:
                expires_at = datetime.fromisoformat(expires_raw)
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
            except Exception:
                expired_states.append(state)
                continue
            if expires_at <= now:
                expired_states.append(state)
        for state in expired_states:
            self.discord_oauth_states.pop(state, None)

    def _default_discord_return_url(self) -> str:
        candidates = [
            (os.getenv("FRONTEND_ORIGIN") or "").strip(),
            *self.allowed_origins,
            "http://localhost:3000",
        ]
        for candidate in candidates:
            if not candidate or "*" in candidate:
                continue
            parsed = urlparse(candidate)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                continue
            return urlunparse((parsed.scheme, parsed.netloc, "/auth", "", "", ""))
        return "http://localhost:3000/auth"

    def _sanitize_discord_return_url(self, candidate: str) -> str:
        fallback = self._default_discord_return_url()
        value = (candidate or "").strip()
        if not value:
            return fallback
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return fallback
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if not self._is_origin_allowed(origin):
            return fallback
        path = parsed.path or "/auth"
        return urlunparse((parsed.scheme, parsed.netloc, path, parsed.params, parsed.query, parsed.fragment))

    def _append_query_params(self, target_url: str, params: dict[str, Any]) -> str:
        parsed = urlparse(target_url)
        existing = dict(parse_qsl(parsed.query, keep_blank_values=True))
        for key, value in params.items():
            if value is None:
                continue
            existing[str(key)] = str(value)
        merged_query = urlencode(existing)
        return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, merged_query, parsed.fragment))

    async def _fetch_discord_oauth_identity(self, code: str) -> Optional[dict[str, Any]]:
        if not self._is_discord_oauth_ready():
            return None

        timeout = ClientTimeout(total=15)
        token_payload: dict[str, Any] | None = None
        try:
            async with ClientSession(timeout=timeout) as session:
                async with session.post(
                    self.discord_oauth_token_url,
                    data={
                        "client_id": self.discord_oauth_client_id,
                        "client_secret": self.discord_oauth_client_secret,
                        "grant_type": "authorization_code",
                        "code": code,
                        "redirect_uri": self.discord_oauth_redirect_uri,
                        "scope": self.discord_oauth_scopes,
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                ) as token_response:
                    token_text = await token_response.text()
                    if token_response.status < 200 or token_response.status >= 300:
                        logger.error(
                            f"Discord OAuth token exchange failed: status={token_response.status} response={token_text}"
                        )
                        return None
                    try:
                        token_payload = json.loads(token_text)
                    except Exception:
                        logger.error("Discord OAuth token response was not valid JSON")
                        return None

                access_token = str((token_payload or {}).get("access_token") or "").strip()
                if not access_token:
                    return None

                async with session.get(
                    self.discord_oauth_me_url,
                    headers={"Authorization": f"Bearer {access_token}"},
                ) as me_response:
                    me_text = await me_response.text()
                    if me_response.status < 200 or me_response.status >= 300:
                        logger.error(
                            f"Discord OAuth profile request failed: status={me_response.status} response={me_text}"
                        )
                        return None
                    try:
                        payload = json.loads(me_text)
                    except Exception:
                        return None
                    if isinstance(payload, dict):
                        return {
                            "user": payload,
                            "accessToken": access_token,
                        }
                    return None
        except Exception as exc:
            logger.error(f"Discord OAuth flow failed: {exc}")
            return None

    def _can_auto_join_discord_guild(self) -> bool:
        return bool(
            self.discord_auto_join_guild
            and self.discord_join_guild_id
            and self.discord_bot_token
        )

    async def _try_auto_join_discord_guild(self, discord_user_id: str, user_access_token: str) -> bool:
        if not self._can_auto_join_discord_guild():
            return False
        if not discord_user_id or not user_access_token:
            return False

        endpoint = f"https://discord.com/api/v10/guilds/{self.discord_join_guild_id}/members/{discord_user_id}"
        timeout = ClientTimeout(total=15)
        try:
            async with ClientSession(timeout=timeout) as session:
                async with session.put(
                    endpoint,
                    headers={
                        "Authorization": f"Bot {self.discord_bot_token}",
                        "Content-Type": "application/json",
                    },
                    json={"access_token": user_access_token},
                ) as response:
                    response_text = await response.text()
                    if response.status in {200, 201, 204}:
                        return True
                    logger.warning(
                        f"Discord guild auto-join failed: status={response.status} response={response_text}"
                    )
                    return False
        except Exception as exc:
            logger.warning(f"Discord guild auto-join request failed: {exc}")
            return False

    async def _append_security_log(self, event: str, status: str) -> None:
        logs = await self._load_state("logs")
        if not isinstance(logs, list):
            logs = []
        logs = [item for item in logs if isinstance(item, dict)]
        logs.insert(
            0,
            {
                "id": f"log-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
                "event": event,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "status": str(status or "SUCCESS").upper(),
                "ip": "api",
            },
        )
        await self._save_state("logs", logs[:100])

    def _sync_invoices_with_orders(self, invoices: list[dict[str, Any]], orders: list[dict[str, Any]]) -> list[dict[str, Any]]:
        synced: list[dict[str, Any]] = [item for item in invoices if isinstance(item, dict)]
        order_to_invoice = {str(item.get("orderId") or ""): item for item in synced if str(item.get("orderId") or "")}

        for order in orders:
            if not isinstance(order, dict):
                continue
            order_id = str(order.get("id") or "").strip()
            if not order_id:
                continue
            user_data = order.get("user")
            user_email = ""
            if isinstance(user_data, dict):
                user_email = str(user_data.get("email") or "").strip()
            status = str(order.get("status") or "pending").strip().lower()
            invoice_status = "paid"
            if status == "refunded":
                invoice_status = "refunded"
            elif status in {"pending", "cancelled"}:
                invoice_status = "unpaid"

            row = order_to_invoice.get(order_id)
            if row is None:
                row = {
                    "id": f"inv-{order_id}",
                    "orderId": order_id,
                    "email": user_email or str(order.get("userId") or "guest"),
                    "total": self._to_float(order.get("total"), default=0.0) or 0.0,
                    "status": invoice_status,
                    "createdAt": str(order.get("createdAt") or datetime.now(timezone.utc).isoformat()),
                }
                synced.append(row)
                order_to_invoice[order_id] = row
            else:
                row["email"] = user_email or str(row.get("email") or order.get("userId") or "guest")
                row["total"] = self._to_float(order.get("total"), default=0.0) or 0.0
                row["status"] = invoice_status
                row["createdAt"] = str(row.get("createdAt") or order.get("createdAt") or datetime.now(timezone.utc).isoformat())

        synced.sort(key=lambda item: str(item.get("createdAt") or ""), reverse=True)
        return synced

    async def _send_chat_log(self, message: str, reply: str) -> bool:
        channel = await self._resolve_channel_with_fallback(self.chat_channel_id, purpose="chat")
        if channel is None:
            logger.warning("Chat channel is not configured and no fallback channel was found.")
            return False

        embed = discord.Embed(title="Website Chat", color=0xFACC15)
        embed.add_field(name="User Message", value=message[:1024], inline=False)
        embed.add_field(name="Bridge Reply", value=reply[:1024], inline=False)
        try:
            await channel.send(embed=embed)
            return True
        except Exception as exc:
            logger.error(f"Failed to post website chat log: {exc}")
            return False

    async def _send_order_log(self, order_data: dict[str, Any], user_data: dict[str, Any], payment_method: str) -> bool:
        channel = await self._resolve_channel_with_fallback(self.order_channel_id, purpose="order")
        if channel is None:
            logger.warning("Order channel is not configured and no fallback channel was found.")
            return False

        order_id = str(order_data.get("id") or "N/A")
        total = self._format_price(order_data.get("total"))
        items = order_data.get("items", [])
        if not isinstance(items, list):
            items = []

        embed = discord.Embed(title="New Website Order", color=0x22C55E)
        embed.add_field(name="Order ID", value=f"`{order_id}`", inline=True)
        embed.add_field(name="Total", value=total, inline=True)
        if payment_method:
            embed.add_field(name="Payment", value=payment_method, inline=True)

        customer_email = str(user_data.get("email") or "").strip()
        customer_id = str(user_data.get("id") or "").strip()
        if customer_email:
            embed.add_field(name="Customer", value=customer_email, inline=False)
        elif customer_id:
            embed.add_field(name="Customer ID", value=f"`{customer_id}`", inline=False)

        item_lines: list[str] = []
        for item in items[:10]:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "Item").strip()
            quantity = item.get("quantity", 1)
            price = self._format_price(item.get("price"), include_prefix=False)
            item_lines.append(f"- {name} x{quantity} ({price})")

        embed.add_field(name="Items", value="\n".join(item_lines)[:1024] if item_lines else "No items", inline=False)
        try:
            await channel.send(embed=embed)
            return True
        except Exception as exc:
            logger.error(f"Failed to post website order log: {exc}")
            return False

    async def _resolve_channel_with_fallback(
        self, channel_id: Optional[int], purpose: str = "generic"
    ) -> Optional[discord.abc.Messageable]:
        direct_channel = self._resolve_channel(channel_id)
        if direct_channel is not None:
            return direct_channel

        # Fallback 1: use configured guild log channels from database setup.
        try:
            from .database import GuildConfig

            for guild in self.bot.guilds:
                config = await GuildConfig.filter(id=str(guild.id)).first()
                candidate_ids: list[str] = []
                if config is not None:
                    if purpose == "chat":
                        candidate_ids.extend(
                            [
                                str(config.cmd_log_channel_id or "").strip(),
                                str(config.log_channel_id or "").strip(),
                                str(config.panel_channel_id or "").strip(),
                            ]
                        )
                    else:
                        candidate_ids.extend(
                            [
                                str(config.log_channel_id or "").strip(),
                                str(config.cmd_log_channel_id or "").strip(),
                                str(config.panel_channel_id or "").strip(),
                            ]
                        )

                for raw_id in candidate_ids:
                    if not raw_id.isdigit():
                        continue
                    fallback_channel = self._resolve_channel(int(raw_id))
                    if fallback_channel is not None:
                        return fallback_channel
        except Exception as exc:
            logger.warning(f"Failed to resolve database fallback channel for {purpose}: {exc}")

        # Fallback 2: first channel where bot can send messages.
        for guild in self.bot.guilds:
            fallback_channel = self._first_sendable_channel(guild)
            if fallback_channel is not None:
                return fallback_channel

        return None

    def _resolve_channel(self, channel_id: Optional[int]) -> Optional[discord.abc.Messageable]:
        if not channel_id:
            return None

        channel = self.bot.get_channel(channel_id)
        if channel is not None and hasattr(channel, "send"):
            return channel

        for guild in self.bot.guilds:
            guild_channel = guild.get_channel(channel_id)
            if guild_channel is not None and hasattr(guild_channel, "send"):
                return guild_channel

        return None

    def _first_sendable_channel(self, guild: discord.Guild) -> Optional[discord.abc.Messageable]:
        member = guild.me
        if member is None and self.bot.user is not None:
            member = guild.get_member(self.bot.user.id)

        if guild.system_channel and hasattr(guild.system_channel, "send"):
            if member is None or guild.system_channel.permissions_for(member).send_messages:
                return guild.system_channel

        for channel in guild.text_channels:
            if not hasattr(channel, "send"):
                continue
            if member is None or channel.permissions_for(member).send_messages:
                return channel
        return None

    def _build_reply(self, message: str, products: list[Any]) -> str:
        in_stock: list[dict[str, Any]] = []
        for product in products:
            if not isinstance(product, dict):
                continue
            stock = self._to_int(product.get("stock"), default=0)
            if stock > 0:
                in_stock.append(product)

        if not in_stock:
            return "Everything is out of stock right now. Ask support for a restock ETA."

        words = [word for word in re.findall(r"[a-z0-9]+", message.lower()) if len(word) > 2]
        if not words:
            candidate = min(in_stock, key=lambda item: self._to_float(item.get("price"), default=999999))
            return self._format_recommendation(candidate)

        def score(product: dict[str, Any]) -> tuple[int, float]:
            text = " ".join(
                [
                    str(product.get("name", "")).lower(),
                    str(product.get("description", "")).lower(),
                    " ".join(str(feature).lower() for feature in product.get("features", []) if isinstance(feature, str)),
                ]
            )
            points = 0
            for word in words:
                if word in text:
                    points += 2 if word in str(product.get("name", "")).lower() else 1
            return points, -self._to_float(product.get("price"), default=999999)

        candidate = max(in_stock, key=score)
        return self._format_recommendation(candidate)

    def _format_recommendation(self, product: dict[str, Any]) -> str:
        name = str(product.get("name") or "this plan")
        duration = str(product.get("duration") or "").strip()
        stock = self._to_int(product.get("stock"), default=0)
        price = self._format_price(product.get("price"))

        if duration:
            return f"Best match right now: {name} ({duration}) for {price}. Stock left: {stock}."
        return f"Best match right now: {name} for {price}. Stock left: {stock}."

    def _format_price(self, value: Any, include_prefix: bool = True) -> str:
        amount = self._to_float(value, default=None)
        if amount is None:
            return "N/A"
        if include_prefix:
            return f"${amount:.2f}"
        return f"{amount:.2f}"

    def _env_bool(self, key: str, default: bool = False) -> bool:
        value = os.getenv(key)
        if value is None:
            return default
        normalized = str(value).strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
        return default

    def _env_int(self, key: str) -> Optional[int]:
        value = os.getenv(key)
        return self._to_int(value, default=None)

    def _ensure_json_file(self, path: Path, default: Any) -> None:
        if path.exists():
            return
        path.write_text(json.dumps(default, indent=2), encoding="utf-8")

    async def _init_supabase_storage(self) -> None:
        if not self.db_url:
            raise RuntimeError("DATABASE_URL or SUPABASE_DATABASE_URL is required for supabase storage")

        normalized_db_url, ssl_arg = self._normalize_postgres_dsn_for_asyncpg(self.db_url)
        pool_kwargs: dict[str, Any] = {
            "dsn": normalized_db_url,
            "min_size": 1,
            "max_size": 5,
            "command_timeout": 30,
        }
        if ssl_arg is not None:
            pool_kwargs["ssl"] = ssl_arg
        try:
            self.pg_pool = await asyncpg.create_pool(**pool_kwargs)
        except Exception as exc:
            if "CERTIFICATE_VERIFY_FAILED" not in str(exc):
                raise

            logger.warning("Shop storage DB certificate verification failed. Retrying with ssl verification disabled.")
            retry_ctx = ssl.create_default_context()
            retry_ctx.check_hostname = False
            retry_ctx.verify_mode = ssl.CERT_NONE
            pool_kwargs["ssl"] = retry_ctx
            self.pg_pool = await asyncpg.create_pool(**pool_kwargs)

        assert self.pg_pool is not None
        async with self.pg_pool.acquire() as conn:
            await conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {self.shop_kv_table} (
                    key TEXT PRIMARY KEY,
                    value_json TEXT NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )

        await self._seed_kv_from_json("products", self.products_file, [])
        await self._seed_kv_from_json("orders", self.orders_file, [])
        await self._seed_kv_from_json("pending_payments", self.pending_payments_file, {})
        await self._seed_kv_from_json("media_library", self.media_library_file, [])
        for state_key in self.state_keys:
            await self._seed_kv_from_json(
                self._state_storage_key(state_key),
                self._state_file(state_key),
                self._default_state_value(state_key),
            )

    async def _seed_kv_from_json(self, key: str, path: Path, default: Any) -> None:
        if self.pg_pool is None:
            return

        existing = await self._db_get_json(key, default=None)
        if existing is not None:
            return

        value = self._read_json(path, default=default)
        await self._db_set_json(key, value)

    async def _db_get_json(self, key: str, default: Any) -> Any:
        if self.pg_pool is None:
            return default

        row = await self.pg_pool.fetchrow(f"SELECT value_json FROM {self.shop_kv_table} WHERE key = $1", key)
        if row is None:
            return default
        try:
            return json.loads(str(row.get("value_json") or ""))
        except Exception:
            return default

    async def _db_set_json(self, key: str, value: Any) -> None:
        if self.pg_pool is None:
            return
        payload = json.dumps(value, ensure_ascii=False)
        await self.pg_pool.execute(
            f"""
            INSERT INTO {self.shop_kv_table} (key, value_json, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (key)
            DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()
            """,
            key,
            payload,
        )

    async def _load_products(self) -> list[dict[str, Any]]:
        if self.use_supabase_storage and self.pg_pool is not None:
            data = await self._db_get_json("products", default=[])
        else:
            data = self._read_json(self.products_file, default=[])
        if not isinstance(data, list):
            return []
        normalized: list[dict[str, Any]] = []
        for item in data:
            if isinstance(item, dict):
                normalized.append(self._normalize_product(item))
        return normalized

    async def _save_products(self, products: list[dict[str, Any]]) -> None:
        if self.use_supabase_storage and self.pg_pool is not None:
            await self._db_set_json("products", products)
            return
        self._write_json(self.products_file, products)

    async def _load_orders(self) -> list[dict[str, Any]]:
        if self.use_supabase_storage and self.pg_pool is not None:
            data = await self._db_get_json("orders", default=[])
        else:
            data = self._read_json(self.orders_file, default=[])
        if not isinstance(data, list):
            return []
        return [item for item in data if isinstance(item, dict)]

    async def _save_orders(self, orders: list[dict[str, Any]]) -> None:
        if self.use_supabase_storage and self.pg_pool is not None:
            await self._db_set_json("orders", orders)
        else:
            self._write_json(self.orders_file, orders)

        current_invoices = await self._load_state("invoices")
        if not isinstance(current_invoices, list):
            current_invoices = []
        synced_invoices = self._sync_invoices_with_orders(current_invoices, orders)
        await self._save_state("invoices", synced_invoices)

    async def _load_pending_payments(self) -> dict[str, Any]:
        if self.use_supabase_storage and self.pg_pool is not None:
            data = await self._db_get_json("pending_payments", default={})
        else:
            data = self._read_json(self.pending_payments_file, default={})
        if not isinstance(data, dict):
            return {}
        return data

    async def _save_pending_payments(self, payload: dict[str, Any]) -> None:
        if self.use_supabase_storage and self.pg_pool is not None:
            await self._db_set_json("pending_payments", payload)
            return
        self._write_json(self.pending_payments_file, payload)

    async def _load_media_library(self) -> list[dict[str, Any]]:
        if self.use_supabase_storage and self.pg_pool is not None:
            data = await self._db_get_json("media_library", default=[])
        else:
            data = self._read_json(self.media_library_file, default=[])
        if not isinstance(data, list):
            return []
        return [item for item in data if isinstance(item, dict)]

    async def _save_media_library(self, items: list[dict[str, Any]]) -> None:
        cleaned = [item for item in items if isinstance(item, dict)]
        if self.use_supabase_storage and self.pg_pool is not None:
            await self._db_set_json("media_library", cleaned)
            return
        self._write_json(self.media_library_file, cleaned)

    def _read_json(self, path: Path, default: Any) -> Any:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return default

    def _write_json(self, path: Path, payload: Any) -> None:
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    @staticmethod
    def _normalize_postgres_dsn_for_asyncpg(db_url: str) -> tuple[str, Any]:
        dsn = db_url.strip()
        if dsn.startswith("postgresql://"):
            dsn = "postgres://" + dsn[len("postgresql://") :]

        parsed = urlparse(dsn)
        if parsed.scheme != "postgres":
            return dsn, None

        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        sslmode = str(query.pop("sslmode", "")).strip().lower()
        explicit_ssl = str(query.pop("ssl", "")).strip().lower()
        host = (parsed.hostname or "").lower()

        force_disable_ssl = sslmode in {"disable"} or explicit_ssl in {"0", "false", "no", "disable"}
        force_enable_ssl = (
            sslmode in {"require", "verify-ca", "verify-full"}
            or explicit_ssl in {"1", "true", "yes", "require", "verify-ca", "verify-full"}
        )
        if force_disable_ssl:
            wants_ssl = False
        elif force_enable_ssl:
            wants_ssl = True
        else:
            wants_ssl = host.endswith(".pooler.supabase.com") or host.endswith(".supabase.co")

        verify_override = str(os.getenv("DB_SSL_VERIFY", "")).strip().lower()
        if verify_override in {"1", "true", "yes"}:
            verify_ssl = True
        elif verify_override in {"0", "false", "no"}:
            verify_ssl = False
        else:
            verify_ssl = not host.endswith(".pooler.supabase.com")

        ssl_arg = None
        if wants_ssl:
            if verify_ssl:
                ssl_arg = ssl.create_default_context()
            else:
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                ssl_arg = ctx

        parsed = parsed._replace(query=urlencode(query))
        return urlunparse(parsed), ssl_arg

    def _public_product(self, product: dict[str, Any]) -> dict[str, Any]:
        public = dict(product)
        public.pop("inventory", None)
        if isinstance(public.get("tiers"), list):
            public_tiers: list[dict[str, Any]] = []
            for tier in public.get("tiers", []):
                if not isinstance(tier, dict):
                    continue
                cleaned = dict(tier)
                cleaned.pop("inventory", None)
                cleaned["stock"] = self._to_int(cleaned.get("stock"), default=0) or 0
                public_tiers.append(cleaned)
            public["tiers"] = public_tiers
        return public

    def _normalize_tier(self, tier: dict[str, Any]) -> dict[str, Any]:
        inventory = tier.get("inventory", [])
        if not isinstance(inventory, list):
            inventory = []
        normalized_inventory = [str(item).strip() for item in inventory if str(item).strip()]
        image_value = str(
            tier.get("image")
            or tier.get("imageUrl")
            or tier.get("image_url")
            or tier.get("thumbnail")
            or ""
        ).strip()
        return {
            "id": str(tier.get("id", "")).strip(),
            "name": str(tier.get("name", "")).strip(),
            "description": str(tier.get("description", "")).strip(),
            "price": self._to_float(tier.get("price"), default=0.0) or 0.0,
            "originalPrice": self._to_float(tier.get("originalPrice"), default=0.0) or 0.0,
            "image": image_value,
            "duration": str(tier.get("duration", "")).strip(),
            "stock": len(normalized_inventory),
            "inventory": normalized_inventory,
        }

    def _find_tier(self, product: dict[str, Any], tier_id: str) -> Optional[dict[str, Any]]:
        tiers = product.get("tiers", [])
        if not isinstance(tiers, list):
            return None
        for tier in tiers:
            if not isinstance(tier, dict):
                continue
            if str(tier.get("id", "")).strip() == tier_id:
                return tier
        return None

    def _compute_product_stock(self, product: dict[str, Any]) -> int:
        tiers = product.get("tiers", [])
        if isinstance(tiers, list) and tiers:
            total = 0
            for tier in tiers:
                if not isinstance(tier, dict):
                    continue
                tier_inventory = tier.get("inventory", [])
                if isinstance(tier_inventory, list):
                    total += len([str(item).strip() for item in tier_inventory if str(item).strip()])
                else:
                    total += self._to_int(tier.get("stock"), default=0) or 0
            return max(0, total)
        inventory = product.get("inventory", [])
        if not isinstance(inventory, list):
            return 0
        return len([str(item).strip() for item in inventory if str(item).strip()])

    def _normalize_product(self, product: dict[str, Any]) -> dict[str, Any]:
        features = product.get("features", [])
        if not isinstance(features, list):
            features = []
        detailed = product.get("detailedDescription", [])
        if not isinstance(detailed, list):
            detailed = []
        tiers = product.get("tiers", [])
        if not isinstance(tiers, list):
            tiers = []
        normalized_tiers: list[dict[str, Any]] = []
        for tier in tiers:
            if not isinstance(tier, dict):
                continue
            normalized_tier = self._normalize_tier(tier)
            if normalized_tier.get("id"):
                normalized_tiers.append(normalized_tier)
        inventory = product.get("inventory", [])
        if not isinstance(inventory, list):
            inventory = []
        normalized_inventory = [str(item).strip() for item in inventory if str(item).strip()]
        stock_value = self._compute_product_stock({"tiers": normalized_tiers, "inventory": normalized_inventory})

        type_value = str(product.get("type", "OTHER")).strip() or "OTHER"
        badge_label = str(product.get("cardBadgeLabel", "")).strip()
        if not badge_label:
            badge_label = "BUNDLE" if type_value == "BUNDLE" else "ACCOUNT"
        badge_icon = str(product.get("cardBadgeIcon", "grid")).strip().lower() or "grid"
        if badge_icon not in {"grid", "key", "shield"}:
            badge_icon = "grid"

        image_value = str(
            product.get("image")
            or product.get("imageUrl")
            or product.get("image_url")
            or product.get("thumbnail")
            or product.get("icon")
            or ""
        ).strip()
        banner_image_value = str(
            product.get("bannerImage")
            or product.get("banner_image")
            or product.get("coverImage")
            or product.get("cover_image")
            or ""
        ).strip()

        return {
            "id": str(product.get("id", "")).strip(),
            "name": str(product.get("name", "")).strip(),
            "description": str(product.get("description", "")).strip(),
            "urlPath": str(product.get("urlPath", "")).strip(),
            "price": self._to_float(product.get("price"), default=0.0) or 0.0,
            "originalPrice": self._to_float(product.get("originalPrice"), default=0.0) or 0.0,
            "duration": str(product.get("duration", "1 Month")).strip() or "1 Month",
            "type": type_value,
            "features": [str(feature) for feature in features],
            "detailedDescription": [str(line) for line in detailed],
            "image": image_value,
            "bannerImage": banner_image_value,
            "category": str(product.get("category", "")).strip(),
            "group": str(product.get("group", "")).strip(),
            "visibility": str(product.get("visibility", "public")).strip() or "public",
            "cardBadgeLabel": badge_label,
            "cardBadgeIcon": badge_icon,
            "hideStockCount": bool(product.get("hideStockCount", False)),
            "showViewsCount": bool(product.get("showViewsCount", False)),
            "showSalesCount": bool(product.get("showSalesCount", False)),
            "liveSalesTimespan": str(product.get("liveSalesTimespan", "all_time")).strip() or "all_time",
            "stock": stock_value,
            "inventory": normalized_inventory,
            "tiers": normalized_tiers,
            "popular": bool(product.get("popular", False)),
            "featured": bool(product.get("featured", False)),
            "verified": bool(product.get("verified", False)),
            "instantDelivery": bool(product.get("instantDelivery", False)),
        }

    @staticmethod
    def _to_int(value: Any, default: Optional[int]) -> Optional[int]:
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _to_float(value: Any, default: Optional[float]) -> Optional[float]:
        try:
            return float(value)
        except (TypeError, ValueError):
            return default
