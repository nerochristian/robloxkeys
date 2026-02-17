from datetime import datetime, timezone

import discord
from discord import app_commands

from ..services.store_api import store_api
from ..utils.base_cog import BaseCog
from ..utils.constants import Colors
from ..utils.embeds import EmbedUtils


class Orders(BaseCog):
    def __init__(self, bot):
        super().__init__(bot)

    @app_commands.command(name="redeem", description="Validate a code against the live license API")
    @app_commands.describe(code="The license or voucher code", email="Your email address")
    async def redeem(self, interaction: discord.Interaction, code: str, email: str):
        await interaction.response.defer(ephemeral=True)

        payload = await store_api.validate_license(code)
        if not isinstance(payload, dict):
            await interaction.followup.send(
                embed=EmbedUtils.error("API Error", "License endpoint did not return a valid response."),
                ephemeral=True,
            )
            return

        is_valid = bool(payload.get("valid"))
        if not is_valid:
            await interaction.followup.send(
                embed=EmbedUtils.error("Invalid Code", f"`{code}` is not valid or already used."),
                ephemeral=True,
            )
            return

        order_id = str(payload.get("orderId") or payload.get("invoiceId") or "N/A")
        product = payload.get("product") if isinstance(payload.get("product"), dict) else {}
        product_name = str(product.get("name") or payload.get("productName") or "Unknown Product")

        embed = discord.Embed(title="Code Validated", color=Colors.SUCCESS)
        embed.description = f"Code `{code}` was validated for `{email}`."
        embed.add_field(name="Order", value=f"`{order_id}`", inline=True)
        embed.add_field(name="Product", value=product_name[:1024], inline=True)
        await interaction.followup.send(embed=embed, ephemeral=True)

    @app_commands.command(name="check-replace", description="Check replacement eligibility for an invoice")
    @app_commands.describe(invoice_id="The invoice ID to check")
    async def check_replace(self, interaction: discord.Interaction, invoice_id: str):
        await interaction.response.defer(ephemeral=True)

        order = await store_api.get_invoice(invoice_id)
        if not isinstance(order, dict):
            await interaction.followup.send(
                embed=EmbedUtils.error("Not Found", f"Invoice `{invoice_id}` was not found."),
                ephemeral=True,
            )
            return

        status = str(order.get("status") or "unknown").strip().lower()
        eligible = status == "completed"
        items = order.get("items") if isinstance(order.get("items"), list) else []

        embed = discord.Embed(
            title=f"Replacement Check - #{invoice_id}",
            color=Colors.INFO,
        )
        embed.add_field(name="Invoice Status", value=status, inline=True)
        embed.add_field(name="Eligible", value="Yes" if eligible else "No", inline=True)
        embed.add_field(name="Items", value=str(len(items)), inline=True)
        await interaction.followup.send(embed=embed, ephemeral=True)

    @app_commands.command(name="methods", description="View enabled payment methods from API")
    async def methods(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)

        payload = await store_api.get_payment_methods()
        if not payload:
            await interaction.followup.send(
                embed=EmbedUtils.error("Unavailable", "Could not fetch payment methods from API."),
                ephemeral=True,
            )
            return

        methods = {}
        if isinstance(payload, dict):
            if isinstance(payload.get("methods"), dict):
                methods = payload.get("methods") or {}
            elif all(isinstance(v, dict) for v in payload.values()):
                methods = payload

        if not methods:
            await interaction.followup.send(
                embed=EmbedUtils.error("Unavailable", "No method configuration returned by API."),
                ephemeral=True,
            )
            return

        lines = []
        for key, row in methods.items():
            if not isinstance(row, dict):
                continue
            if not bool(row.get("enabled", False)):
                continue
            mode = "auto" if bool(row.get("automated", False)) else "manual"
            lines.append(f"- {str(key).capitalize()} ({mode})")

        if not lines:
            lines = ["No payment methods are currently enabled."]

        embed = discord.Embed(title="Payment Methods", description="\n".join(lines), color=Colors.PRIMARY)
        await interaction.followup.send(embed=embed, ephemeral=True)

    @app_commands.command(name="payment-methods", description="Check if a payment method is enabled in API")
    @app_commands.describe(method="Choose method")
    @app_commands.choices(
        method=[
            app_commands.Choice(name="PayPal", value="paypal"),
            app_commands.Choice(name="CashApp", value="cashapp"),
            app_commands.Choice(name="Bitcoin", value="btc"),
            app_commands.Choice(name="Ethereum", value="eth"),
            app_commands.Choice(name="Credit Card", value="card"),
        ]
    )
    async def payment_methods(self, interaction: discord.Interaction, method: str):
        await interaction.response.defer(ephemeral=True)

        payload = await store_api.get_payment_methods()
        if not isinstance(payload, dict):
            await interaction.followup.send(
                embed=EmbedUtils.error("API Error", "Could not load payment configuration."),
                ephemeral=True,
            )
            return

        methods = payload.get("methods") if isinstance(payload.get("methods"), dict) else payload
        if not isinstance(methods, dict):
            await interaction.followup.send(
                embed=EmbedUtils.error("API Error", "Invalid payment method payload."),
                ephemeral=True,
            )
            return

        alias_map = {"btc": "crypto", "eth": "crypto", "cashapp": "paypal"}
        api_key = alias_map.get(method.strip().lower(), method.strip().lower())
        row = methods.get(api_key)

        if not isinstance(row, dict):
            await interaction.followup.send(
                embed=EmbedUtils.error("Unsupported", f"`{method}` is not exposed by API."),
                ephemeral=True,
            )
            return
        if not bool(row.get("enabled", False)):
            await interaction.followup.send(
                embed=EmbedUtils.error("Disabled", f"`{method}` is currently disabled."),
                ephemeral=True,
            )
            return

        automated = bool(row.get("automated", False))
        details = (
            "Automated checkout is enabled. Use website checkout flow."
            if automated
            else "Manual flow. Complete payment and open a support ticket with your invoice."
        )
        embed = discord.Embed(title=f"{api_key.capitalize()} Payment", description=details, color=Colors.SUCCESS)
        embed.add_field(name="Enabled", value="Yes", inline=True)
        embed.add_field(name="Automated", value="Yes" if automated else "No", inline=True)
        await interaction.followup.send(embed=embed, ephemeral=True)

    @app_commands.command(name="invoice-id", description="Look up an invoice by ID from API")
    @app_commands.describe(invoice_id="The invoice ID")
    async def invoice_lookup(self, interaction: discord.Interaction, invoice_id: str):
        await interaction.response.defer(ephemeral=True)

        data = await store_api.get_invoice(invoice_id)
        if not isinstance(data, dict):
            await interaction.followup.send(
                embed=EmbedUtils.error("Not Found", f"Invoice `{invoice_id}` was not found in API."),
                ephemeral=True,
            )
            return

        def _value(val, fallback="Unknown"):
            if val is None or val == "":
                return fallback
            return str(val)

        def _amount(amount, currency):
            if amount is None or amount == "":
                return "Unknown"
            return f"{amount} {currency}" if currency else str(amount)

        def _format_time(raw):
            if raw is None or raw == "":
                return "Unknown"
            if isinstance(raw, (int, float)):
                ts = int(raw)
                if ts > 10_000_000_000:
                    ts //= 1000
                dt = datetime.fromtimestamp(ts, tz=timezone.utc)
                return discord.utils.format_dt(dt, style="f")
            raw_s = str(raw).strip()
            if raw_s.isdigit():
                return _format_time(int(raw_s))
            try:
                dt = datetime.fromisoformat(raw_s.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return discord.utils.format_dt(dt, style="f")
            except Exception:
                return raw_s

        invoice_id_value = _value(data.get("id") or data.get("invoice_id") or invoice_id)
        status = _value(data.get("status") or data.get("state"))
        gateway = _value(data.get("gateway") or data.get("payment_gateway") or data.get("method"))
        user_payload = data.get("user") if isinstance(data.get("user"), dict) else {}
        email = _value(data.get("email") or user_payload.get("email") or data.get("customer_email"))

        currency = data.get("currency") or data.get("currency_code") or ""
        total_price = _amount(data.get("total") or data.get("total_price") or data.get("amount"), currency)
        total_paid = _amount(data.get("total_paid") or data.get("paid") or data.get("amount_paid"), currency)

        items = data.get("items")
        if isinstance(items, dict):
            items = items.get("items") or items.get("data")
        if not isinstance(items, list):
            items = []

        item_lines = []
        for idx, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                item_lines.append(f"{idx}. {_value(item)}")
                continue
            name = _value(item.get("name") or item.get("product_name") or item.get("title"), "Item")
            qty = item.get("quantity") or item.get("qty") or 1
            price = item.get("price") or item.get("total") or item.get("amount")
            item_currency = item.get("currency") or currency
            price_text = _amount(price, item_currency) if price is not None else None
            row = f"{idx}. {name} x{qty}"
            if price_text and price_text != "Unknown":
                row = f"{row} - {price_text}"
            item_lines.append(row)

        items_value = "\n".join(item_lines) if item_lines else "No items"
        if len(items_value) > 1000:
            items_value = items_value[:1000] + "..."

        embed = discord.Embed(
            title=f"Invoice: {invoice_id_value}",
            color=Colors.INFO,
        )
        embed.add_field(name="Status", value=status, inline=True)
        embed.add_field(name="Gateway", value=gateway, inline=True)
        embed.add_field(name="Email", value=email, inline=False)
        embed.add_field(
            name="Amounts",
            value=f"Total Price: {total_price}\nTotal Paid: {total_paid}",
            inline=False,
        )
        embed.add_field(name="Items", value=items_value, inline=False)
        embed.add_field(
            name="Created",
            value=_format_time(data.get("created_at") or data.get("createdAt") or data.get("created")),
            inline=True,
        )
        embed.add_field(
            name="Completed",
            value=_format_time(data.get("completed_at") or data.get("completedAt") or data.get("completed")),
            inline=True,
        )
        embed.set_footer(text="Invoices System")

        await interaction.followup.send(embed=embed, ephemeral=True)


async def setup(bot):
    await bot.add_cog(Orders(bot))

