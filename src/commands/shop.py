import discord
from discord import app_commands
from discord.ext import commands
from typing import List, Optional
from ..utils.base_cog import BaseCog
from ..utils.embeds import EmbedUtils
from ..utils.constants import Emojis, Colors
from ..utils.components_v2 import ComponentsV2, create_container, create_feature_list
from ..services.store_api import store_api
from ..utils.logger import logger

class Shop(BaseCog):
    def __init__(self, bot):
        super().__init__(bot)

    async def product_autocomplete(self, interaction: discord.Interaction, current: str) -> List[app_commands.Choice[str]]:
        products = await store_api.get_products()
        if not products:
            return []
        
        choices = []
        for p in products:
            if current.lower() in p['name'].lower():
                choices.append(app_commands.Choice(name=p['name'], value=str(p['id'])))
        
        return choices[:25] # Discord limit

    @app_commands.command(name="stock", description="View real-time stock levels for all products")
    async def stock(self, interaction: discord.Interaction, product: Optional[str] = None):

        await interaction.response.defer()
        
        try:
            products = await store_api.get_products()
            if not products:
                await interaction.followup.send(embed=EmbedUtils.error("API Error", "Could not fetch products."))
                return

            if product:
                # Filter for specific product if simple string match (basic logic, can be improved)
                filtered = [p for p in products if product.lower() in p['name'].lower()]
                products = filtered

            container = create_container(title="📦 Real-Time Stock Levels", color=Colors.PRIMARY)
            container.set_description("Current inventory status for all available products.")
            
            total_stock = 0
            
            for p in products:
                stock_count = p.get('stock', 0)
                price = p.get('price', 0)
                currency = p.get('currency', 'USD')
                
                status_emoji = "🔴"
                if stock_count == -1: # Unlimited
                    status_emoji = "♾️"
                    stock_str = "Unlimited"
                elif stock_count > 10:
                    status_emoji = "🟢"
                    stock_str = str(stock_count)
                elif stock_count > 0:
                    status_emoji = "🟡"
                    stock_str = str(stock_count)
                else:
                    stock_str = "Out of Stock"

                if stock_count > 0:
                     total_stock += stock_count

                container.add_field(
                    name=f"{status_emoji} {p['name']}",
                    value=f"**Price**: {price} {currency}\n**Stock**: `{stock_str}`",
                    inline=True
                )

            container.set_footer(f"Total Available Items: {total_stock if total_stock > 0 else 'N/A'}", icon_url=self.bot.user.display_avatar.url)
            
            await interaction.followup.send(embed=container.build())

        except Exception as e:
            logger.error(f"Error in stock command: {e}")
            await interaction.followup.send(embed=EmbedUtils.error("System Error", "An unexpected error occurred."))

    @app_commands.command(name="product", description="View detailed product information")
    @app_commands.describe(product_id="The product to view")
    @app_commands.autocomplete(product_id=product_autocomplete)
    async def product(self, interaction: discord.Interaction, product_id: str):
        await interaction.response.defer()
        
        try:
            product = await store_api.get_product(product_id)
            if not product:
                await interaction.followup.send(embed=EmbedUtils.error("Not Found", "Product not found."))
                return

            embed = create_container(title=product['name'], color=Colors.PRIMARY).build()
            embed.description = product.get('description', 'No description available.')
            
            price = f"{product.get('price')} {product.get('currency', 'USD')}"
            stock = product.get('stock')
            stock_str = "Unlimited" if stock == -1 else str(stock)

            embed.add_field(name="💰 Price", value=f"`{price}`", inline=True)
            embed.add_field(name="📦 Stock", value=f"`{stock_str}`", inline=True)
            
            # Add "Buy Now" button
            view = discord.ui.View()
            if product.get('url'): # Assuming API returns a direct link
                 view.add_item(discord.ui.Button(label="Buy Now", url=product['url'], style=discord.ButtonStyle.link, emoji="🛒"))

            await interaction.followup.send(embed=embed, view=view)

        except Exception as e:
             logger.error(f"Error in product command: {e}")
             await interaction.followup.send(embed=EmbedUtils.error("System Error", str(e)))

    @app_commands.command(name="leaderboard", description="View top buyers")
    async def leaderboard(self, interaction: discord.Interaction):
        await interaction.response.defer()
        # Mocking leaderboard for now or implement via your store API if endpoint exists
        
        embed = create_container(title=f"{Emojis.LEADERBOARD} Top Buyers", color=Colors.INFO).build()
        embed.description = "Our most loyal customers!"
        
        # Placeholder data
        top_buyers = [
            {"name": "Anonymous", "total": 500, "rank": 1},
            {"name": "Customer123", "total": 250, "rank": 2},
            {"name": "VIP_User", "total": 120, "rank": 3},
        ]
        
        medals = ["🥇", "🥈", "🥉"]
        
        desc = ""
        for i, buyer in enumerate(top_buyers):
            medal = medals[i] if i < 3 else f"`#{i+1}`"
            desc += f"{medal} **{buyer['name']}** - ${buyer['total']}\n"
            
        embed.description = desc
        await interaction.followup.send(embed=embed)

async def setup(bot):
    await bot.add_cog(Shop(bot))
