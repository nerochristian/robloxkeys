from typing import List, Optional

import discord
from discord import app_commands

from ..services.store_api import store_api
from ..utils.base_cog import BaseCog
from ..utils.constants import Colors, Emojis
from ..utils.embeds import EmbedUtils
from ..utils.components_v2 import create_container


class Shop(BaseCog):
    def __init__(self, bot):
        super().__init__(bot)

    async def product_autocomplete(self, interaction: discord.Interaction, current: str) -> List[app_commands.Choice[str]]:
        products = await store_api.get_products()
        if not products:
            return []

        choices: List[app_commands.Choice[str]] = []
        needle = current.lower().strip()
        for product in products:
            if not isinstance(product, dict):
                continue
            name = str(product.get("name") or "")
            pid = str(product.get("id") or "")
            if not name or not pid:
                continue
            if not needle or needle in name.lower():
                choices.append(app_commands.Choice(name=name[:100], value=pid))
        return choices[:25]

    @app_commands.command(name="stock", description="View real-time stock levels for products")
    @app_commands.describe(product="Optional product name filter")
    async def stock(self, interaction: discord.Interaction, product: Optional[str] = None):
        await interaction.response.defer()

        products = await store_api.get_products()
        if not products:
            await interaction.followup.send(embed=EmbedUtils.error("API Error", "Could not fetch products."))
            return

        needle = (product or "").strip().lower()
        rows: List[dict] = []
        for row in products:
            if not isinstance(row, dict):
                continue
            name = str(row.get("name") or "").strip()
            if not name:
                continue
            if needle and needle not in name.lower():
                continue
            rows.append(row)

        if not rows:
            await interaction.followup.send(embed=EmbedUtils.info("No Matches", "No products match that filter."))
            return

        embed = create_container(title="Real-Time Stock Levels", color=Colors.PRIMARY).build()
        total_stock = 0
        for row in rows[:25]:
            name = str(row.get("name") or "Product")
            price = float(row.get("price") or 0.0)
            currency = str(row.get("currency") or "USD")
            stock = row.get("stock")
            stock_i = int(stock) if isinstance(stock, (int, float, str)) and str(stock).lstrip("-").isdigit() else 0

            if stock_i == -1:
                status = "Unlimited"
                icon = "∞"
            elif stock_i > 10:
                status = str(stock_i)
                icon = "In stock"
                total_stock += stock_i
            elif stock_i > 0:
                status = str(stock_i)
                icon = "Low stock"
                total_stock += stock_i
            else:
                status = "Out of stock"
                icon = "Out"

            embed.add_field(
                name=f"{name}",
                value=f"Price: {price:.2f} {currency}\nStock: `{status}` ({icon})",
                inline=True,
            )

        embed.set_footer(text=f"Total available items: {total_stock if total_stock > 0 else 'N/A'}")
        await interaction.followup.send(embed=embed)

    @app_commands.command(name="product", description="View detailed product information")
    @app_commands.describe(product_id="The product to view")
    @app_commands.autocomplete(product_id=product_autocomplete)
    async def product(self, interaction: discord.Interaction, product_id: str):
        await interaction.response.defer()

        product = await store_api.get_product(product_id)
        if not isinstance(product, dict):
            await interaction.followup.send(embed=EmbedUtils.error("Not Found", "Product not found."))
            return

        name = str(product.get("name") or "Product")
        description = str(product.get("description") or "No description provided.")
        price = float(product.get("price") or 0.0)
        currency = str(product.get("currency") or "USD")
        stock_raw = product.get("stock")
        stock = int(stock_raw) if isinstance(stock_raw, (int, float, str)) and str(stock_raw).lstrip("-").isdigit() else 0

        stock_label = "Unlimited" if stock == -1 else str(max(0, stock))
        embed = create_container(title=name, color=Colors.PRIMARY).build()
        embed.description = description
        embed.add_field(name="Price", value=f"`{price:.2f} {currency}`", inline=True)
        embed.add_field(name="Stock", value=f"`{stock_label}`", inline=True)

        view = discord.ui.View()
        product_url = str(product.get("url") or "").strip()
        if product_url:
            view.add_item(discord.ui.Button(label="Buy Now", url=product_url, style=discord.ButtonStyle.link))
            await interaction.followup.send(embed=embed, view=view)
            return

        await interaction.followup.send(embed=embed)

    @app_commands.command(name="leaderboard", description="View top buyers from live analytics")
    async def leaderboard(self, interaction: discord.Interaction):
        await interaction.response.defer()

        analytics = await store_api.get_analytics("30d")
        if not isinstance(analytics, dict) or not analytics.get("ok"):
            await interaction.followup.send(
                embed=EmbedUtils.error("API Error", "Could not fetch analytics from store API."),
            )
            return

        customers = analytics.get("customers") if isinstance(analytics.get("customers"), list) else []
        if not customers:
            await interaction.followup.send(embed=EmbedUtils.info("No Data", "No customer purchase data yet."))
            return

        customers = [row for row in customers if isinstance(row, dict)]
        customers.sort(
            key=lambda row: (float(row.get("totalSpent", 0.0) or 0.0), int(row.get("orders", 0) or 0)),
            reverse=True,
        )

        embed = create_container(title=f"{Emojis.LEADERBOARD} Top Buyers", color=Colors.INFO).build()
        lines: List[str] = []
        medals = ["1", "2", "3"]
        for idx, row in enumerate(customers[:10], start=1):
            badge = medals[idx - 1] if idx <= len(medals) else str(idx)
            email = str(row.get("email") or row.get("id") or "customer")
            orders = int(row.get("orders", 0) or 0)
            spent = float(row.get("totalSpent", 0.0) or 0.0)
            lines.append(f"{badge}. **{email}** - ${spent:.2f} ({orders} orders)")
        embed.description = "\n".join(lines)

        await interaction.followup.send(embed=embed)


async def setup(bot):
    await bot.add_cog(Shop(bot))

