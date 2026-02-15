import json
import os
import asyncio
from typing import Any, Dict, Optional

import aiohttp
from dotenv import load_dotenv

from ..utils.logger import logger


class StoreApiService:
    def __init__(self):
        self.base_url = ""
        self.api_key = ""
        self.shop_id = ""
        self.auth_header = "x-api-key"
        self.auth_scheme = ""
        self.include_shop_id_in_path = False
        self.timeout_seconds = 15.0
        self.max_retries = 1
        self.endpoint_templates: Dict[str, str] = {}
        self.extra_headers: Dict[str, str] = {}
        self._refresh_config()

    def _refresh_config(self) -> None:
        load_dotenv()

        configured_base_url = (os.getenv("STORE_API_BASE_URL") or "").strip()
        internal_base = (
            os.getenv("BOT_INTERNAL_API_BASE_URL")
            or os.getenv("RAILWAY_PRIVATE_DOMAIN")
            or ""
        ).strip()
        port_value = (os.getenv("PORT") or os.getenv("BOT_API_PORT") or "8080").strip() or "8080"

        if configured_base_url:
            self.base_url = self._normalize_base_url(configured_base_url, default_port=port_value, default_path="/shop")
        elif internal_base:
            self.base_url = self._normalize_base_url(internal_base, default_port=port_value, default_path="/shop")
        else:
            self.base_url = f"http://127.0.0.1:{port_value}/shop"
        self.api_key = (
            os.getenv("STORE_API_KEY")
            or os.getenv("BOT_API_KEY")
            or ""
        ).strip()
        self.shop_id = (os.getenv("STORE_API_SHOP_ID") or "").strip()
        self.auth_header = os.getenv("STORE_API_AUTH_HEADER", "x-api-key").strip() or "x-api-key"
        self.auth_scheme = os.getenv("STORE_API_AUTH_SCHEME", "").strip()
        self.include_shop_id_in_path = os.getenv("STORE_API_INCLUDE_SHOP_ID_IN_PATH", "false").lower() in {"1", "true", "yes"}
        self.timeout_seconds = self._to_float(os.getenv("STORE_API_TIMEOUT_SECONDS"), default=15.0)
        self.max_retries = self._to_int(os.getenv("STORE_API_MAX_RETRIES"), default=1)
        self.extra_headers = self._parse_extra_headers()

        self.endpoint_templates = {
            "products": os.getenv("STORE_API_PRODUCTS_ENDPOINT", "products"),
            "product": os.getenv("STORE_API_PRODUCT_ENDPOINT", "products/{product_id}"),
            "invoice": os.getenv("STORE_API_INVOICE_ENDPOINT", "invoices/{invoice_id}"),
            "payment_methods": os.getenv("STORE_API_PAYMENT_METHODS_ENDPOINT", "payment-methods"),
            "validate_license": os.getenv("STORE_API_VALIDATE_LICENSE_ENDPOINT", "licenses/validate"),
            "analytics": os.getenv("STORE_API_ANALYTICS_ENDPOINT", "analytics"),
            "coupons": os.getenv("STORE_API_COUPONS_ENDPOINT", "coupons"),
        }

    async def _request(self, method: str, endpoint: str, data: Optional[Dict[str, Any]] = None) -> Any:
        self._refresh_config()
        if not self.base_url:
            logger.warning("STORE_API_BASE_URL is not configured.")
            return None

        url = self._build_url(endpoint)
        headers = self._build_headers()
        timeout = aiohttp.ClientTimeout(total=self.timeout_seconds)

        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                kwargs: Dict[str, Any] = {"headers": headers}
                if method.upper() == "GET" and data:
                    kwargs["params"] = data
                elif data is not None:
                    kwargs["json"] = data

                retries = max(0, self.max_retries)
                for attempt in range(retries + 1):
                    async with session.request(method.upper(), url, **kwargs) as response:
                        body = await response.text()

                        if response.status in (429, 502, 503, 504) and attempt < retries:
                            retry_after = self._to_float(response.headers.get("Retry-After"), default=0.5)
                            await asyncio.sleep(min(max(retry_after, 0.2), 5.0))
                            continue

                        if response.status < 200 or response.status >= 300:
                            logger.error(f"Store API error {response.status} at {url}: {body[:300]}")
                            return None

                        content_type = response.headers.get("Content-Type", "").lower()
                        if "application/json" in content_type:
                            try:
                                return await response.json()
                            except Exception:
                                pass

                        if not body:
                            return {}

                        try:
                            return json.loads(body)
                        except json.JSONDecodeError:
                            return body

                return None
        except Exception as exc:
            logger.error(f"Store API request failed ({method} {url}): {exc}")
            return None

    def _build_url(self, endpoint: str) -> str:
        if endpoint.startswith("http://") or endpoint.startswith("https://"):
            return endpoint

        parts = [self.base_url.rstrip("/")]
        if self.include_shop_id_in_path and self.shop_id:
            parts.append(self.shop_id)
        parts.append(endpoint.lstrip("/"))
        return "/".join(parts)

    def _build_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if not self.api_key:
            headers.update(self.extra_headers)
            return headers

        value = self.api_key
        if self.auth_scheme:
            value = f"{self.auth_scheme} {self.api_key}"

        headers[self.auth_header] = value
        headers.update(self.extra_headers)
        return headers

    @staticmethod
    def _normalize_base_url(raw_url: str, default_port: str, default_path: str = "/shop") -> str:
        value = raw_url.strip().rstrip("/")
        if not value:
            return ""

        if not value.startswith(("http://", "https://")):
            value = f"http://{value}"

        parsed = aiohttp.helpers.URL(value)
        path = parsed.path.rstrip("/")
        if not path:
            path = default_path

        # For local/private plain hostnames, append port when none is provided.
        if parsed.port is None and parsed.scheme == "http" and parsed.host in {"127.0.0.1", "localhost"}:
            value = f"{parsed.scheme}://{parsed.host}:{default_port}{path}"
        elif parsed.port is None and parsed.scheme == "http" and "." not in (parsed.host or ""):
            value = f"{parsed.scheme}://{parsed.host}:{default_port}{path}"
        else:
            value = f"{parsed.scheme}://{parsed.host}{f':{parsed.port}' if parsed.port else ''}{path}"

        return value

    def _parse_extra_headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {}

        raw_json = (os.getenv("STORE_API_EXTRA_HEADERS_JSON") or "").strip()
        if raw_json:
            try:
                parsed = json.loads(raw_json)
                if isinstance(parsed, dict):
                    for key, value in parsed.items():
                        if key and value is not None:
                            headers[str(key)] = str(value)
            except json.JSONDecodeError:
                logger.warning("Invalid STORE_API_EXTRA_HEADERS_JSON value; expected JSON object.")

        raw_pairs = (os.getenv("STORE_API_EXTRA_HEADERS") or "").strip()
        if raw_pairs:
            for pair in raw_pairs.split(","):
                part = pair.strip()
                if not part or ":" not in part:
                    continue
                key, value = part.split(":", 1)
                key = key.strip()
                value = value.strip()
                if key:
                    headers[key] = value

        return headers

    def _endpoint(self, key: str, **kwargs: Any) -> str:
        template = self.endpoint_templates.get(key, "")
        if not template:
            return ""
        try:
            return template.format(**kwargs)
        except KeyError:
            return template

    async def get_products(self):
        return await self._request("GET", self._endpoint("products"))

    async def get_product(self, product_id: str):
        return await self._request("GET", self._endpoint("product", product_id=product_id))

    async def get_invoice(self, invoice_id: str):
        return await self._request("GET", self._endpoint("invoice", invoice_id=invoice_id))

    async def validate_license(self, key: str):
        return await self._request("POST", self._endpoint("validate_license"), {"key": key})

    async def get_payment_methods(self):
        return await self._request("GET", self._endpoint("payment_methods"))

    async def get_analytics(self, timeframe: str = "30d"):
        endpoint = self._endpoint("analytics")
        return await self._request("GET", endpoint, {"range": timeframe})

    async def create_coupon(self, data: Dict[str, Any]):
        return await self._request("POST", self._endpoint("coupons"), data)

    @staticmethod
    def _to_float(value: Any, default: float) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _to_int(value: Any, default: int) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return default


store_api = StoreApiService()
