import discord
from datetime import datetime, timezone
from discord import app_commands
from discord.ext import commands
from ..utils.base_cog import BaseCog
from ..utils.embeds import EmbedUtils
from ..utils.constants import Emojis, Colors
from ..utils.components_v2 import create_container
from ..services.store_api import store_api

class Orders(BaseCog):
    def __init__(self, bot):
        super().__init__(bot)

    # --- Public Commands ---

    @app_commands.command(name="redeem", description="Redeem a voucher code")
    @app_commands.describe(code="The voucher code", email="Your email address")
    async def redeem(self, interaction: discord.Interaction, code: str, email: str):
        await interaction.response.defer(ephemeral=True)
        # Logic to redeem
        await interaction.followup.send(embed=EmbedUtils.success("Redeemed", f"Successfully redeemed code `{code}` for `{email}`! check your inbox."))

    @app_commands.command(name="check-replace", description="Check replacement status for an invoice")
    @app_commands.describe(invoice_id="The invoice ID to check")
    async def check_replace(self, interaction: discord.Interaction, invoice_id: str):
        await interaction.response.defer(ephemeral=True)
        
        # Try to get order
        order = await store_api.get_invoice(invoice_id)
        
        if not order:
            return await interaction.followup.send(
                embed=EmbedUtils.error("Not Found", f"Invoice `{invoice_id}` was not found.")
            )
        
        # Check replacement eligibility (mock logic)
        embed = discord.Embed(
            title=f"🔄 Replacement Check - #{invoice_id}",
            color=Colors.INFO
        )
        embed.add_field(name="Invoice Status", value=order.get('status', 'Unknown'), inline=True)
        embed.add_field(name="Eligible for Replacement", value="✅ Yes" if order.get('status') == 'completed' else "❌ No", inline=True)
        embed.add_field(name="Products", value=str(len(order.get('items', []))), inline=True)
        
        await interaction.followup.send(embed=embed)

    @app_commands.command(name="methods", description="View available payment methods")
    async def methods(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)

        methods = await store_api.get_payment_methods()
        if not methods:
            return await interaction.followup.send(
                embed=EmbedUtils.error("Unavailable", "Could not fetch payment methods from your store API."),
                ephemeral=True,
            )

        if isinstance(methods, dict):
            data = (
                methods.get("data")
                or methods.get("payment_methods")
                or methods.get("methods")
                or methods.get("result")
            )
        else:
            data = methods

        if isinstance(data, dict):
            nested = data.get("payment_methods") or data.get("methods") or data.get("data")
            if isinstance(nested, list):
                data = nested

        if not data:
            return await interaction.followup.send(
                embed=EmbedUtils.error("Unavailable", "No payment methods were returned by your store API."),
                ephemeral=True,
            )

        method_names = []
        for item in data if isinstance(data, list) else [data]:
            if isinstance(item, str):
                method_names.append(item)
                continue
            if isinstance(item, dict):
                name = item.get("name") or item.get("title") or item.get("method") or item.get("type")
                if name:
                    method_names.append(str(name))

        if not method_names:
            return await interaction.followup.send(
                embed=EmbedUtils.error("Unavailable", "No payment methods were returned by your store API."),
                ephemeral=True,
            )

        embed = discord.Embed(
            title="💳 Payment Methods",
            description="\n".join([f"• {name}" for name in method_names]),
            color=Colors.PRIMARY,
        )
        embed.set_footer(text="Powered by Store API")

        await interaction.followup.send(embed=embed, ephemeral=True)

    @app_commands.command(name="payment-methods", description="Select your preferred payment method")
    @app_commands.describe(method="Choose your payment method")
    @app_commands.choices(method=[
        app_commands.Choice(name="PayPal", value="paypal"),
        app_commands.Choice(name="CashApp", value="cashapp"),
        app_commands.Choice(name="Bitcoin", value="btc"),
        app_commands.Choice(name="Ethereum", value="eth"),
        app_commands.Choice(name="Credit Card", value="card"),
    ])
    async def payment_methods(self, interaction: discord.Interaction, method: str):
        method_info = {
            "paypal": ("PayPal", "Send to: payments@robloxkeys.store"),
            "cashapp": ("CashApp", "Send to: $robloxkeys"),
            "btc": ("Bitcoin", "Address will be provided after confirmation"),
            "eth": ("Ethereum", "Address will be provided after confirmation"),
            "card": ("Credit Card", "Checkout via our secure payment page"),
        }
        
        name, details = method_info.get(method, ("Unknown", "Contact support"))
        
        embed = discord.Embed(
            title=f"💳 {name} Payment",
            description=f"**Instructions:**\n{details}\n\nAfter payment, open a ticket with your invoice details.",
            color=Colors.SUCCESS
        )
        
        await interaction.response.send_message(embed=embed, ephemeral=True)

    # --- Staff Commands ---

    @app_commands.command(name="invoice-id", description="Look up an invoice by ID")
    @app_commands.describe(invoice_id="The invoice ID")
    async def invoice_lookup(self, interaction: discord.Interaction, invoice_id: str):
        await interaction.response.defer(ephemeral=True)
        
        order = await store_api.get_invoice(invoice_id)
        data = order.get("data") if isinstance(order, dict) else None
        if not data and isinstance(order, dict):
            data = order.get("invoice") or order
        if not data:
            data = {
                "id": invoice_id,
                "email": "customer@example.com",
                "total": "19.99",
                "total_paid": "19.99",
                "currency": "USD",
                "items": [{"name": "LifeTime Key", "quantity": 1, "price": "19.99"}],
                "status": "completed",
                "manual": False,
                "gateway": "manual",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }

        def _value(val, fallback="Unknown"):
            if val is None or val == "":
                return fallback
            return str(val)

        def _bool(val):
            if val is None:
                return "Unknown"
            return "Yes" if bool(val) else "No"

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
                    ts = int(ts / 1000)
                dt = datetime.fromtimestamp(ts, tz=timezone.utc)
                return discord.utils.format_dt(dt, style="f")
            if isinstance(raw, str):
                raw_str = raw.strip()
                if raw_str.isdigit():
                    return _format_time(int(raw_str))
                try:
                    raw_str = raw_str.replace("Z", "+00:00")
                    dt = datetime.fromisoformat(raw_str)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    return discord.utils.format_dt(dt, style="f")
                except Exception:
                    return raw
            return str(raw)

        invoice_id_value = _value(data.get("id") or data.get("invoice_id") or invoice_id)
        status = _value(data.get("status") or data.get("state"))
        manual = _bool(data.get("manual") or data.get("is_manual"))
        replace = _bool(data.get("replace") or data.get("replacement") or data.get("replaceable"))
        gateway = _value(data.get("gateway") or data.get("payment_gateway") or data.get("method"))
        email = _value(data.get("email") or data.get("customer_email"))
        number_id = _value(data.get("number") or data.get("invoice_number") or data.get("short_id"))

        currency = data.get("currency") or data.get("currency_code") or ""
        total_price = _amount(data.get("total") or data.get("total_price") or data.get("amount"), currency)
        total_paid = _amount(data.get("total_paid") or data.get("paid") or data.get("amount_paid"), currency)

        items = data.get("items") or data.get("products") or []
        if isinstance(items, dict):
            items = items.get("data") or items.get("items") or []

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
            line = f"{idx}. {name} x{qty}"
            if price_text and price_text != "Unknown":
                line = f"{line} • {price_text}"
            item_lines.append(line)

        items_value = "\n".join(item_lines) if item_lines else "No items"
        if len(items_value) > 1000:
            items_value = items_value[:1000] + "..."

        embed = discord.Embed(
            title=f"🧾 Invoice: {invoice_id_value}",
            color=Colors.INFO,
        )
        embed.add_field(name="🔒 Status", value=status, inline=True)
        embed.add_field(name="🧾 Manual", value=manual, inline=True)
        embed.add_field(name="🆔 ID", value=number_id, inline=True)
        embed.add_field(name="🧩 Replace", value=replace, inline=True)
        embed.add_field(name="💳 Gateway", value=gateway, inline=True)
        embed.add_field(name="📧 Email", value=email, inline=True)
        embed.add_field(
            name="💰 Amounts",
            value=f"Total Price: {total_price}\nTotal Paid: {total_paid}",
            inline=False,
        )
        embed.add_field(name="📦 Items", value=items_value, inline=False)
        embed.add_field(name="🕒 Created", value=_format_time(data.get("created_at") or data.get("created")), inline=True)
        embed.add_field(name="✅ Completed", value=_format_time(data.get("completed_at") or data.get("completed")), inline=True)
        embed.set_footer(text="Invoices System")

        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="See Items", style=discord.ButtonStyle.secondary, custom_id=f"invoice_items_{invoice_id}"))
        view.add_item(discord.ui.Button(label="Replace Details", style=discord.ButtonStyle.secondary, custom_id=f"invoice_replace_{invoice_id}"))
        view.add_item(discord.ui.Button(label="Staff Actions", style=discord.ButtonStyle.secondary, custom_id=f"invoice_staff_{invoice_id}"))

        await interaction.followup.send(embed=embed, view=view)

async def setup(bot):
    await bot.add_cog(Orders(bot))

