import discord
from discord import app_commands
from typing import Literal, Optional

from ..services.store_api import store_api
from ..utils.base_cog import BaseCog
from ..utils.constants import Colors, Emojis
from ..utils.embeds import EmbedUtils
from ..utils.components_v2 import create_container


class Marketing(BaseCog):
    def __init__(self, bot):
        super().__init__(bot)

    @app_commands.command(name="announce", description="Send a styled announcement")
    @app_commands.describe(
        message="The content",
        title="Title of announcement",
        type="Style of announcement",
        channel="Channel to send into (default: current)",
    )
    async def announce(
        self,
        interaction: discord.Interaction,
        title: str,
        message: str,
        type: Literal["general", "maintenance", "update", "drop"] = "general",
        channel: Optional[discord.TextChannel] = None,
    ):
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message(
                embed=EmbedUtils.error("Unauthorized", "You need administrator permissions."),
                ephemeral=True,
            )
            return

        target_channel = channel or interaction.channel
        styles = {
            "general": (Colors.PRIMARY, "Announcement"),
            "maintenance": (Colors.WARNING, "Maintenance"),
            "update": (Colors.INFO, "Update"),
            "drop": (Colors.SUCCESS, "Drop"),
        }
        color, label = styles.get(type, (Colors.PRIMARY, "Announcement"))

        embed = create_container(title=f"{label}: {title}", color=color).build()
        embed.description = message
        embed.set_footer(
            text=f"Announced by {interaction.user.display_name}",
            icon_url=interaction.user.display_avatar.url,
        )

        await interaction.response.send_message(
            f"Sent announcement to {target_channel.mention}",
            ephemeral=True,
        )
        await target_channel.send(embed=embed)

    @app_commands.command(name="analytics", description="View live sales analytics from API")
    @app_commands.describe(timeframe="Analytics window")
    async def analytics(
        self,
        interaction: discord.Interaction,
        timeframe: Literal["24h", "7d", "30d"] = "30d",
    ):
        await interaction.response.defer(ephemeral=True)

        analytics = await store_api.get_analytics(timeframe)
        if not isinstance(analytics, dict) or not analytics.get("ok"):
            await interaction.followup.send(
                embed=EmbedUtils.error("API Error", "Could not fetch analytics from store API."),
            )
            return

        metrics = analytics.get("metrics") if isinstance(analytics.get("metrics"), dict) else {}
        top_products = analytics.get("topProducts") if isinstance(analytics.get("topProducts"), list) else []
        customers = analytics.get("customers") if isinstance(analytics.get("customers"), list) else []

        revenue = float(metrics.get("revenue", 0.0) or 0.0)
        total_orders = int(metrics.get("totalOrders", 0) or 0)
        completed_orders = int(metrics.get("completedOrders", 0) or 0)
        pending_orders = int(metrics.get("pendingOrders", 0) or 0)
        conversion = (completed_orders / total_orders * 100.0) if total_orders > 0 else 0.0

        best_seller = "No sales yet"
        if top_products:
            best_seller = str(top_products[0].get("name") or "Unknown product")

        embed = create_container(
            title=f"{Emojis.ANALYTICS} Sales Analytics ({timeframe})",
            color=Colors.INFO,
        ).build()
        embed.description = "Live metrics sourced from `/shop/analytics`."
        embed.add_field(name="Revenue", value=f"`$ {revenue:.2f}`", inline=True)
        embed.add_field(name="Orders", value=f"`{total_orders}`", inline=True)
        embed.add_field(name="Pending", value=f"`{pending_orders}`", inline=True)
        embed.add_field(name="Conversion", value=f"`{conversion:.1f}%`", inline=True)
        embed.add_field(name="Customers", value=f"`{len(customers)}`", inline=True)
        embed.add_field(name="Best Seller", value=best_seller[:1024], inline=False)

        await interaction.followup.send(embed=embed)


async def setup(bot):
    await bot.add_cog(Marketing(bot))

