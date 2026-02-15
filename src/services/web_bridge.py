import hmac
import os
import re
import fnmatch
import json
import secrets
import ssl
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlencode, urlparse, urlunparse, parse_qsl

import asyncpg
import discord
from aiohttp import ClientSession, web

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
        self.admin_password = (os.getenv("ADMIN_PASSWORD") or "Pokemon2020!").strip()
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
        self.paypal_checkout_url = (os.getenv("PAYPAL_CHECKOUT_URL") or "").strip()
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

        self.app = web.Application(
            middlewares=[
                self._error_middleware,
                self._cors_middleware,
                self._auth_middleware,
            ]
        )
        self.app.router.add_route("OPTIONS", "/{tail:.*}", self._handle_options)
        self.app.router.add_get("/api/bot/health", self.health)
        self.app.router.add_post("/api/bot/chat", self.chat)
        self.app.router.add_post("/api/bot/order", self.order)
        self.app.router.add_get("/shop/health", self.shop_health)
        self.app.router.add_get("/shop/products", self.shop_products)
        self.app.router.add_get("/shop/invoices/{invoice_id}", self.shop_get_invoice)
        self.app.router.add_get("/shop/orders", self.shop_orders)
        self.app.router.add_get("/shop/state/{state_key}", self.shop_get_state)
        self.app.router.add_put("/shop/state/{state_key}", self.shop_set_state)
        self.app.router.add_get("/shop/payment-methods", self.shop_payment_methods)
        self.app.router.add_get("/shop/admin/summary", self.shop_admin_summary)
        self.app.router.add_post("/shop/auth/login", self.shop_auth_login)
        self.app.router.add_post("/shop/auth/register", self.shop_auth_register)
        self.app.router.add_post("/shop/products", self.shop_upsert_product)
        self.app.router.add_delete("/shop/products/{product_id}", self.shop_delete_product)
        self.app.router.add_get("/shop/inventory/{product_id}", self.shop_get_inventory)
        self.app.router.add_post("/shop/inventory/add", self.shop_add_inventory)
        self.app.router.add_post("/shop/stock", self.shop_update_stock)
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
    async def _cors_middleware(self, request: web.Request, handler):
        response = await handler(request)
        self._apply_cors_headers(request, response)
        return response

    @web.middleware
    async def _auth_middleware(self, request: web.Request, handler):
        if request.method == "OPTIONS":
            return await handler(request)

        if request.path in {"/api/bot/health", "/shop/health"}:
            return await handler(request)

        if request.method == "GET" and request.path in {"/shop/products", "/shop/payment-methods"}:
            return await handler(request)

        if not self.api_key:
            return await handler(request)

        received_key = request.headers.get(self.api_key_header, "").strip()
        if self.api_auth_scheme and received_key.lower().startswith(f"{self.api_auth_scheme} "):
            received_key = received_key[len(self.api_auth_scheme) + 1 :].strip()

        auth_header = request.headers.get("authorization", "").strip()
        if not received_key and self.api_auth_scheme and auth_header.lower().startswith(f"{self.api_auth_scheme} "):
            received_key = auth_header[len(self.api_auth_scheme) + 1 :].strip()
        elif not received_key and auth_header.lower().startswith("bearer "):
            received_key = auth_header[7:].strip()

        if not received_key or not hmac.compare_digest(received_key, self.api_key):
            return web.json_response(
                {"ok": False, "message": "unauthorized"},
                status=401,
            )

        return await handler(request)

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

    async def shop_health(self, request: web.Request):
        products = await self._load_products()
        orders = await self._load_orders()
        pending = await self._load_pending_payments()
        return web.json_response(
            {
                "ok": True,
                "products": len(products),
                "orders": len(orders),
                "pendingPayments": len(pending),
                "stripeEnabled": bool(self.stripe_secret_key),
                "oxapayEnabled": bool(self.oxapay_merchant_api_key),
                "storageBackend": "supabase" if self.use_supabase_storage else "json",
                "data_dir": str(self.data_dir),
            }
        )

    async def shop_products(self, request: web.Request):
        products = [self._public_product(product) for product in await self._load_products()]
        return web.json_response({"ok": True, "products": products})

    async def shop_get_invoice(self, request: web.Request):
        invoice_id = str(request.match_info.get("invoice_id", "")).strip()
        if not invoice_id:
            return web.json_response({"ok": False, "message": "invoice id is required"}, status=400)

        orders = await self._load_orders()
        for order in orders:
            if str(order.get("id", "")).strip() == invoice_id:
                return web.json_response({"ok": True, "invoice": order, "data": order})
        return web.json_response({"ok": False, "message": "invoice not found"}, status=404)

    async def shop_orders(self, request: web.Request):
        user_id = str(request.query.get("userId", "")).strip()
        user_email = str(request.query.get("userEmail", "")).strip().lower()
        status_filter = str(request.query.get("status", "")).strip().lower()

        orders = await self._load_orders()
        rows: list[dict[str, Any]] = []
        for order in orders:
            if not isinstance(order, dict):
                continue
            row_status = str(order.get("status") or "pending").strip().lower()
            if status_filter and row_status != status_filter:
                continue
            if user_id and str(order.get("userId") or "").strip() != user_id:
                continue

            user_payload = order.get("user")
            user_data = user_payload if isinstance(user_payload, dict) else {}
            row_email = str(user_data.get("email") or "").strip().lower()
            if user_email and row_email != user_email:
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
        return web.json_response({"ok": True, "state": state_value})

    async def shop_auth_login(self, request: web.Request):
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
            if str(user.get("password", "")).strip() != password:
                continue
            public_user = dict(user)
            public_user.pop("password", None)
            await self._append_security_log(f"User Authentication Successful: {email}", "SUCCESS")
            return web.json_response({"ok": True, "user": public_user})

        await self._append_security_log(f"Failed Login Attempt: {email}", "CRITICAL")
        return web.json_response({"ok": False, "message": "invalid email or password"}, status=401)

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
            "password": password,
            "role": "user",
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        users.append(user)
        await self._save_state("users", users)
        await self._append_security_log(f"New User Registered: {email}", "SUCCESS")

        public_user = dict(user)
        public_user.pop("password", None)
        return web.json_response({"ok": True, "user": public_user})

    async def shop_payment_methods(self, request: web.Request):
        crypto_automated = bool(self.oxapay_merchant_api_key)
        crypto_enabled = crypto_automated or bool(self.crypto_checkout_url)
        methods = {
            "card": {"enabled": bool(self.stripe_secret_key), "automated": True},
            "paypal": {"enabled": bool(self.paypal_checkout_url), "automated": False},
            "crypto": {"enabled": crypto_enabled, "automated": crypto_automated},
        }
        return web.json_response({"ok": True, "methods": methods})

    async def shop_admin_summary(self, request: web.Request):
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
                name = str(item.get("name") or item_id or "Unknown Product").strip()
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

    async def shop_delete_product(self, request: web.Request):
        product_id = str(request.match_info.get("product_id", "")).strip()
        if not product_id:
            return web.json_response({"ok": False, "message": "product id is required"}, status=400)

        products = await self._load_products()
        filtered = [product for product in products if str(product.get("id")) != product_id]
        if len(filtered) == len(products):
            return web.json_response({"ok": False, "message": "product not found"}, status=404)

        await self._save_products(filtered)
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

    async def shop_buy(self, request: web.Request):
        payload = await self._safe_json(request)
        if payload is None:
            return web.json_response({"ok": False, "message": "invalid json body"}, status=400)

        order_data = payload.get("order", payload)
        user_data = payload.get("user", {})
        payment_method = str(payload.get("paymentMethod", "")).strip()
        payment_verified = bool(payload.get("paymentVerified", False))
        if not isinstance(order_data, dict):
            return web.json_response({"ok": False, "message": "order payload is required"}, status=400)
        if not isinstance(user_data, dict):
            user_data = {}

        if payment_method == "card" and not payment_verified:
            return web.json_response(
                {"ok": False, "message": "Card payments must be completed through /shop/payments/create"},
                status=402,
            )

        purchase = await self._process_purchase(order_data, user_data, payment_method)
        if isinstance(purchase, web.Response):
            return purchase

        order_record, public_products = purchase
        await self._send_order_log(order_record, user_data, payment_method)
        return web.json_response({"ok": True, "orderId": order_record["id"], "order": order_record, "products": public_products})

    async def shop_create_payment(self, request: web.Request):
        payload = await self._safe_json(request)
        if payload is None:
            return web.json_response({"ok": False, "message": "invalid json body"}, status=400)

        payment_method = str(payload.get("paymentMethod", "")).strip() or "card"
        order_data = payload.get("order", {})
        user_data = payload.get("user", {})
        success_url = str(payload.get("successUrl", "")).strip()
        cancel_url = str(payload.get("cancelUrl", "")).strip()

        if not isinstance(order_data, dict):
            return web.json_response({"ok": False, "message": "order payload is required"}, status=400)
        if not isinstance(user_data, dict):
            user_data = {}

        total = self._to_float(order_data.get("total"), default=0.0) or 0.0
        if total <= 0:
            return web.json_response({"ok": False, "message": "order total must be greater than zero"}, status=400)

        if payment_method != "card":
            if payment_method == "crypto" and self.oxapay_merchant_api_key:
                if total < self.oxapay_min_amount:
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
                    "order": order_data,
                    "user": user_data,
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

                order_id = str(order_data.get("id") or pending_token)
                description = f"Order {order_id}"
                customer_email = str(user_data.get("email") or "").strip()
                oxapay_request_payload: dict[str, Any] = {
                    "merchant": self.oxapay_merchant_api_key,
                    "amount": round(total, 2),
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
                        "amount": round(total, 2),
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

            external_url = ""
            if payment_method == "paypal":
                external_url = self.paypal_checkout_url
            elif payment_method == "crypto":
                external_url = self.crypto_checkout_url

            if not external_url:
                return web.json_response(
                    {"ok": False, "message": f"{payment_method} is not configured"},
                    status=400,
                )

            query = urlencode({"amount": f"{total:.2f}", "order_id": str(order_data.get("id", ""))})
            glue = "&" if "?" in external_url else "?"
            return web.json_response({"ok": True, "checkoutUrl": f"{external_url}{glue}{query}", "manual": True})

        if not self.stripe_secret_key:
            return web.json_response({"ok": False, "message": "Stripe is not configured"}, status=503)

        items = order_data.get("items", [])
        if not isinstance(items, list) or not items:
            return web.json_response({"ok": False, "message": "order items are required"}, status=400)

        pending_token = secrets.token_urlsafe(24)
        pending = await self._load_pending_payments()
        pending[pending_token] = {
            "order": order_data,
            "user": user_data,
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
            ("metadata[order_id]", str(order_data.get("id") or "")),
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
        payment_method = requested_method or str(pending_entry.get("paymentMethod", "")).strip().lower() or "card"

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
        if order_id:
            for existing_order in await self._load_orders():
                if str(existing_order.get("id") or "").strip() == order_id:
                    # Idempotent confirmation: if already processed, do not consume stock twice.
                    return existing_order, [self._public_product(product) for product in products]

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

        order_record = {
            "id": str(order_data.get("id") or f"ord-{int(datetime.now(timezone.utc).timestamp())}"),
            "userId": str(user_data.get("id") or order_data.get("userId") or "guest"),
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "paymentMethod": payment_method,
            "user": user_data if isinstance(user_data, dict) else {},
            "items": items,
            "total": self._to_float(order_data.get("total"), default=0.0) or 0.0,
            "status": "completed",
            "credentials": credentials,
        }
        orders = await self._load_orders()
        orders.append(order_record)
        await self._save_orders(orders)

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
                "currency": "USD",
                "paypalEmail": "",
                "stripeKey": "",
                "cryptoAddress": "",
            },
            "users": [
                {
                    "id": "admin-1337",
                    "email": self.admin_email,
                    "password": self.admin_password,
                    "role": "admin",
                    "createdAt": datetime.now(timezone.utc).isoformat(),
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
            normalized_user = {
                "id": str(user.get("id") or f"user-{int(datetime.now(timezone.utc).timestamp() * 1000)}"),
                "email": email,
                "password": str(user.get("password") or ""),
                "role": "admin" if role == "admin" else "user",
                "createdAt": str(user.get("createdAt") or datetime.now(timezone.utc).isoformat()),
            }
            if email == self.admin_email:
                normalized_user["id"] = str(user.get("id") or "admin-1337")
                normalized_user["password"] = self.admin_password
                normalized_user["role"] = "admin"
                admin_found = True
            normalized.append(normalized_user)

        if not admin_found:
            normalized.insert(
                0,
                {
                    "id": "admin-1337",
                    "email": self.admin_email,
                    "password": self.admin_password,
                    "role": "admin",
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                },
            )
        return normalized

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
        channel = self._resolve_channel(self.chat_channel_id)
        if channel is None:
            logger.warning("Chat channel is not configured. Set WEBSITE_CHAT_CHANNEL_ID.")
            return False

        embed = discord.Embed(title="Website Chat", color=0xFACC15)
        embed.add_field(name="User Message", value=message[:1024], inline=False)
        embed.add_field(name="Bridge Reply", value=reply[:1024], inline=False)
        await channel.send(embed=embed)
        return True

    async def _send_order_log(self, order_data: dict[str, Any], user_data: dict[str, Any], payment_method: str) -> bool:
        channel = self._resolve_channel(self.order_channel_id)
        if channel is None:
            logger.warning("Order channel is not configured. Set WEBSITE_ORDER_CHANNEL_ID.")
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
        await channel.send(embed=embed)
        return True

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
        return {
            "id": str(tier.get("id", "")).strip(),
            "name": str(tier.get("name", "")).strip(),
            "description": str(tier.get("description", "")).strip(),
            "price": self._to_float(tier.get("price"), default=0.0) or 0.0,
            "originalPrice": self._to_float(tier.get("originalPrice"), default=0.0) or 0.0,
            "image": str(tier.get("image", "")).strip(),
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
            "image": str(product.get("image", "")).strip(),
            "bannerImage": str(product.get("bannerImage", "")).strip(),
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
