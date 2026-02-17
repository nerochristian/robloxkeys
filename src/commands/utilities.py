
import discord
from discord import app_commands
from discord.ext import commands
from typing import Optional
from ..utils.base_cog import BaseCog
from ..utils.embeds import EmbedUtils
from ..utils.constants import Emojis, Colors
from ..services.database import AutoRoleConfig
import re
import json


class Utilities(BaseCog):


    @app_commands.command(name="bot-info", description="View bot information and statistics")
    async def info(self, interaction: discord.Interaction):
        await interaction.response.defer()
        
        embed = discord.Embed(
            title=f"{Emojis.STORE} Roblox Keys Bot",
            description="A powerful support and management bot.",
            color=Colors.PRIMARY
        )
        
        embed.add_field(name="Servers", value=str(len(self.bot.guilds)), inline=True)
        embed.add_field(name="Users", value=str(sum(g.member_count for g in self.bot.guilds)), inline=True)
        embed.add_field(name="Latency", value=f"{round(self.bot.latency * 1000)}ms", inline=True)
        embed.add_field(name="Discord.py", value=discord.__version__, inline=True)
        
        embed.set_thumbnail(url=self.bot.user.display_avatar.url)
        
        await interaction.followup.send(embed=embed)

    @app_commands.command(name="calculator", description="Solve a math expression")
    @app_commands.describe(expression="The math expression to solve (e.g., 2+2, 5*10)")
    async def calculator(self, interaction: discord.Interaction, expression: str):
        # Sanitize input - only allow safe characters
        if not re.match(r'^[\d\s\+\-\*\/\(\)\.\^%]+$', expression):
            return await interaction.response.send_message(
                embed=EmbedUtils.error("Invalid Expression", "Only numbers and basic operators are allowed."),
                ephemeral=True
            )
        
        try:
            # Replace ^ with ** for exponents
            safe_expr = expression.replace('^', '**')
            result = eval(safe_expr)
            
            embed = discord.Embed(
                title="🧮 Calculator",
                color=Colors.PRIMARY
            )
            embed.add_field(name="Expression", value=f"`{expression}`", inline=False)
            embed.add_field(name="Result", value=f"**{result}**", inline=False)
            
            await interaction.response.send_message(embed=embed)
        except Exception as e:
            await interaction.response.send_message(
                embed=EmbedUtils.error("Calculation Error", str(e)),
                ephemeral=True
            )

    @app_commands.command(name="poll", description="Create a poll")
    @app_commands.describe(question="The poll question", options="Comma-separated options (max 10)")
    async def poll(self, interaction: discord.Interaction, question: str, options: str):
        await interaction.response.defer()
        
        option_list = [o.strip() for o in options.split(',')][:10]
        
        if len(option_list) < 2:
            return await interaction.followup.send(
                embed=EmbedUtils.error("Error", "You need at least 2 options."),
                ephemeral=True
            )
        
        emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']
        
        embed = discord.Embed(
            title=f"📊 {question}",
            color=Colors.PRIMARY
        )
        
        description = ""
        for i, opt in enumerate(option_list):
            description += f"{emojis[i]} {opt}\n"
        
        embed.description = description
        embed.set_footer(text=f"Poll by {interaction.user.display_name}")
        
        msg = await interaction.followup.send(embed=embed)
        
        # Add reactions
        for i in range(len(option_list)):
            await msg.add_reaction(emojis[i])

    @app_commands.command(name="clear-channel", description="Delete multiple messages from a channel")
    @app_commands.describe(amount="Number of messages to delete (1-100)")
    @app_commands.default_permissions(manage_messages=True)
    async def clear_channel(self, interaction: discord.Interaction, amount: int):
        if amount < 1 or amount > 100:
            return await interaction.response.send_message(
                embed=EmbedUtils.error("Error", "Amount must be between 1 and 100."),
                ephemeral=True
            )
        
        await interaction.response.defer(ephemeral=True)
        
        deleted = await interaction.channel.purge(limit=amount)
        
        await interaction.followup.send(
            embed=EmbedUtils.success("Cleared", f"Deleted **{len(deleted)}** messages."),
            ephemeral=True
        )

    @app_commands.command(name="rename-channel", description="Rename a channel")
    @app_commands.describe(channel="The channel to rename", name="The new name")
    @app_commands.default_permissions(manage_channels=True)
    async def rename_channel(self, interaction: discord.Interaction, channel: discord.TextChannel, name: str):
        await interaction.response.defer(ephemeral=True)
        
        old_name = channel.name
        await channel.edit(name=name)
        
        await interaction.followup.send(
            embed=EmbedUtils.success("Renamed", f"Channel renamed from `{old_name}` to `{name}`.")
        )

    @app_commands.command(name="add-emojis", description="Add an emoji to the server")
    @app_commands.describe(name="Emoji name", url="Image URL for the emoji")
    @app_commands.default_permissions(manage_emojis=True)
    async def add_emojis(self, interaction: discord.Interaction, name: str, url: str):
        await interaction.response.defer(ephemeral=True)
        
        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as resp:
                    if resp.status != 200:
                        return await interaction.followup.send(
                            embed=EmbedUtils.error("Error", "Could not download image.")
                        )
                    image_data = await resp.read()
            
            emoji = await interaction.guild.create_custom_emoji(name=name, image=image_data)
            await interaction.followup.send(
                embed=EmbedUtils.success("Emoji Added", f"Created emoji {emoji}")
            )
        except discord.Forbidden:
            await interaction.followup.send(embed=EmbedUtils.error("Error", "I don't have permission to add emojis."))
        except Exception as e:
            await interaction.followup.send(embed=EmbedUtils.error("Error", str(e)))

    @app_commands.command(name="autoroles", description="Set up autorole for new members")
    @app_commands.describe(role="The role to give to new members")
    @app_commands.default_permissions(administrator=True)
    async def autoroles(self, interaction: discord.Interaction, role: discord.Role):
        await interaction.response.defer(ephemeral=True)

        await AutoRoleConfig.update_or_create(
            guild_id=str(interaction.guild_id),
            defaults={"role_id": str(role.id)},
        )

        await interaction.followup.send(
            embed=EmbedUtils.success(
                "Autorole Set",
                f"New members will now automatically receive {role.mention}.",
            )
        )

    @app_commands.command(name="terms", description="Display Terms of Service")
    async def terms(self, interaction: discord.Interaction):
        embed = discord.Embed(
            title="📜 Terms of Service",
            description=(
                "By using Roblox Keys services, you agree to:\n\n"
                "**1.** No chargebacks or disputes\n"
                "**2.** No sharing of purchased products\n"
                "**3.** No refunds after delivery\n"
                "**4.** Respect support staff\n"
                "**5.** Provide accurate information for orders\n\n"
                "Violation may result in service termination."
            ),
            color=Colors.WARNING
        )
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="products-warranty", description="View product warranty information")
    async def products_warranty(self, interaction: discord.Interaction):
        embed = discord.Embed(
            title="🛡️ Product Warranty",
            description=(
                "**Warranty Coverage:**\n\n"
                "• **Lifetime Products** - Unlimited replacements\n"
                "• **Monthly Products** - 30 days coverage\n"
                "• **Weekly Products** - 7 days coverage\n\n"
                "**To claim warranty:**\n"
                "1. Open a replacement ticket\n"
                "2. Provide your order ID\n"
                "3. Include proof of issue\n"
                "4. Wait for staff review"
            ),
            color=Colors.INFO
        )
        await interaction.response.send_message(embed=embed)


async def setup(bot):
    await bot.add_cog(Utilities(bot))



