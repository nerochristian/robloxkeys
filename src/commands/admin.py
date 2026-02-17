import discord
from discord import app_commands
from discord.ext import commands
from typing import Literal, Optional
from ..utils.base_cog import BaseCog
from ..utils.embeds import EmbedUtils
from ..utils.constants import Emojis, Colors
from ..utils.components_v2 import create_container
from ..services.database import GuildConfig, BlockedUser
from ..services.store_api import store_api

class Admin(BaseCog):
    def __init__(self, bot):
        super().__init__(bot)

    @app_commands.command(name="admin", description="Administration commands")
    async def admin_config(self, interaction: discord.Interaction, action: Literal['view_config', 'set_log']):
        if not interaction.user.guild_permissions.administrator:
            return await interaction.response.send_message("Admin only.", ephemeral=True)
            
        await interaction.response.defer(ephemeral=True)

        guild_id = str(interaction.guild_id)
        if action == 'view_config':
            config = await GuildConfig.filter(id=guild_id).first()
            summary = await store_api.get_admin_summary()
            metrics = summary.get("metrics") if isinstance(summary, dict) else {}

            log_channel = interaction.guild.get_channel(int(config.log_channel_id)) if config and str(config.log_channel_id or "").isdigit() else None
            cmd_log_channel = interaction.guild.get_channel(int(config.cmd_log_channel_id)) if config and str(config.cmd_log_channel_id or "").isdigit() else None
            staff_role = interaction.guild.get_role(int(config.staff_role_id)) if config and str(config.staff_role_id or "").isdigit() else None
            panel_channel = interaction.guild.get_channel(int(config.panel_channel_id)) if config and str(config.panel_channel_id or "").isdigit() else None
            ticket_category = interaction.guild.get_channel(int(config.ticket_category_id)) if config and str(config.ticket_category_id or "").isdigit() else None

            embed = create_container(title=f"{Emojis.ADMIN} Server Configuration", color=Colors.SECONDARY).build()
            embed.add_field(name="Setup Completed", value="Yes" if (config and config.setup_completed) else "No", inline=True)
            embed.add_field(name="Staff Role", value=staff_role.mention if staff_role else "Not configured", inline=True)
            embed.add_field(name="Ticket Category", value=ticket_category.mention if ticket_category else "Not configured", inline=True)
            embed.add_field(name="Panel Channel", value=panel_channel.mention if panel_channel else "Not configured", inline=True)
            embed.add_field(name="Log Channel", value=log_channel.mention if log_channel else "Not configured", inline=True)
            embed.add_field(name="Command Log Channel", value=cmd_log_channel.mention if cmd_log_channel else "Not configured", inline=True)

            if isinstance(metrics, dict) and metrics:
                embed.add_field(name="API Orders", value=str(metrics.get("totalOrders", 0)), inline=True)
                embed.add_field(name="API Revenue", value=f"${float(metrics.get('revenue', 0.0)):.2f}", inline=True)
                embed.add_field(name="API Customers", value=str(metrics.get("customers", 0)), inline=True)

            await interaction.followup.send(embed=embed)
        else:
            await GuildConfig.update_or_create(
                id=guild_id,
                defaults={
                    "log_channel_id": str(interaction.channel_id),
                    "cmd_log_channel_id": str(interaction.channel_id),
                },
            )
            await interaction.followup.send(
                embed=EmbedUtils.success(
                    "Log Channels Set",
                    f"Log and command-log channels are now set to {interaction.channel.mention}.",
                )
            )

    @app_commands.command(name="blacklist", description="Manage user blacklist")
    @app_commands.describe(user="User to add/remove (not needed for list)", reason="Reason for blacklist")
    async def blacklist(
        self,
        interaction: discord.Interaction,
        action: Literal['add', 'remove', 'list'],
        user: Optional[discord.Member] = None,
        reason: Optional[str] = None,
    ):
        if not interaction.user.guild_permissions.manage_guild:
             return await interaction.response.send_message("Unauthorized.", ephemeral=True)

        await interaction.response.defer(ephemeral=True)
        guild_id = str(interaction.guild_id)

        if action == 'add':
            if user is None:
                return await interaction.followup.send(embed=EmbedUtils.error("Missing User", "Provide a user to blacklist."))

            existing = await BlockedUser.filter(guild_id=guild_id, user_id=str(user.id)).first()
            if existing:
                existing.reason = reason or existing.reason or "No reason"
                existing.blocked_by = str(interaction.user.id)
                await existing.save()
                return await interaction.followup.send(
                    embed=EmbedUtils.success("Updated", f"{user.mention} is already blacklisted. Reason updated.")
                )

            await BlockedUser.create(
                guild_id=guild_id,
                user_id=str(user.id),
                blocked_by=str(interaction.user.id),
                reason=reason or "No reason",
            )
            await interaction.followup.send(embed=EmbedUtils.success("Blacklisted", f"{user.mention} has been blacklisted."))
        elif action == 'remove':
            if user is None:
                return await interaction.followup.send(embed=EmbedUtils.error("Missing User", "Provide a user to unblacklist."))

            deleted = await BlockedUser.filter(guild_id=guild_id, user_id=str(user.id)).delete()
            if deleted == 0:
                return await interaction.followup.send(embed=EmbedUtils.info("Not Found", f"{user.mention} is not blacklisted."))

            await interaction.followup.send(embed=EmbedUtils.success("Unblacklisted", f"{user.mention} removed from blacklist."))
        else:
            rows = await BlockedUser.filter(guild_id=guild_id).order_by("-created_at")
            if not rows:
                return await interaction.followup.send(embed=EmbedUtils.info("Blacklist", "Blacklist is empty."))

            lines = []
            for row in rows[:25]:
                blocked_user = interaction.guild.get_member(int(row.user_id)) if str(row.user_id).isdigit() else None
                blocker = interaction.guild.get_member(int(row.blocked_by)) if str(row.blocked_by).isdigit() else None
                who = blocked_user.mention if blocked_user else f"`{row.user_id}`"
                by = blocker.mention if blocker else f"`{row.blocked_by}`"
                why = (row.reason or "No reason").strip()
                lines.append(f"- {who} • by {by} • {why}")

            embed = create_container(title="Blacklist", color=Colors.WARNING).build()
            embed.description = "\n".join(lines)
            await interaction.followup.send(embed=embed)

    @app_commands.command(name="webhook", description="Test Webhook")
    async def webhook(self, interaction: discord.Interaction):
        if not interaction.user.guild_permissions.administrator:
             return await interaction.response.send_message("Admin only.", ephemeral=True)
             
        await interaction.response.defer(ephemeral=True)

        orders = await store_api.get_orders()
        if not orders:
            return await interaction.followup.send(
                embed=EmbedUtils.error("No Orders", "No orders found from API to test webhook output.")
            )

        def _sort_key(row: dict) -> str:
            return str(row.get("createdAt") or "")

        latest = sorted([r for r in orders if isinstance(r, dict)], key=_sort_key, reverse=True)[0]
        items = latest.get("items", [])
        if not isinstance(items, list):
            items = []

        item_lines: list[str] = []
        for item in items[:10]:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or item.get("productId") or "Item")
            qty = item.get("quantity", 1)
            price = item.get("price")
            if price is None:
                item_lines.append(f"- {name} x{qty}")
            else:
                item_lines.append(f"- {name} x{qty} (${float(price):.2f})")

        user_payload = latest.get("user")
        user_data = user_payload if isinstance(user_payload, dict) else {}
        customer = str(user_data.get("email") or latest.get("userId") or "unknown")

        embed = create_container(title=f"{Emojis.SUCCESS} API Webhook Preview", color=Colors.SUCCESS).build()
        embed.add_field(name="Order ID", value=f"`{str(latest.get('id') or 'N/A')}`", inline=True)
        embed.add_field(name="Total", value=f"${float(latest.get('total') or 0.0):.2f}", inline=True)
        embed.add_field(name="Status", value=str(latest.get("status") or "unknown"), inline=True)
        embed.add_field(name="Customer", value=customer[:1024], inline=False)
        embed.add_field(name="Items", value="\n".join(item_lines)[:1024] if item_lines else "No items", inline=False)

        await interaction.channel.send(embed=embed)
        await interaction.followup.send(embed=EmbedUtils.success("Posted", f"Sent API-backed webhook preview to {interaction.channel.mention}."))
    
    @app_commands.command(name="set-welcome", description="Set the channel for welcome messages")
    @app_commands.describe(channel="The channel to send welcome images to")
    async def set_welcome(self, interaction: discord.Interaction, channel: discord.TextChannel):
        if not interaction.user.guild_permissions.administrator:
            return await interaction.response.send_message("Admin only.", ephemeral=True)
            
        await interaction.response.defer(ephemeral=True)

        await GuildConfig.update_or_create(
            id=str(interaction.guild_id),
            defaults={
                "welcome_channel_id": str(channel.id)
            }
        )
        
        await interaction.followup.send(
            embed=EmbedUtils.success(
                "Welcome Channel Set", 
                f"Welcome messages will now be sent to {channel.mention}"
            )
        )

    @app_commands.command(name="testwrlecomw", description="Send a test welcome card")
    async def test_welcome(self, interaction: discord.Interaction):
        if not interaction.guild or not isinstance(interaction.user, discord.Member):
            return await interaction.response.send_message("Guild only.", ephemeral=True)
        if not interaction.user.guild_permissions.administrator:
            return await interaction.response.send_message("Admin only.", ephemeral=True)

        await interaction.response.defer()

        from ..utils.welcome_card import build_welcome_card_file

        try:
            file = await build_welcome_card_file(self.bot, interaction.user)
            await interaction.followup.send(
                f"Test welcome card for {interaction.user.mention}.",
                file=file,
            )
        except Exception as e:
            await interaction.followup.send(
                embed=EmbedUtils.error("Welcome Card Error", str(e)),
                ephemeral=True,
            )

async def setup(bot):
    await bot.add_cog(Admin(bot))
