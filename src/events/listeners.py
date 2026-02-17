import discord
from discord.ext import commands
from discord import app_commands
from ..utils.base_cog import BaseCog
from ..utils.embeds import EmbedUtils
from ..utils.logger import logger
from ..utils.constants import Colors
from ..services.database import GuildConfig
from datetime import datetime

class GeneralListeners(BaseCog):
    def __init__(self, bot):
        super().__init__(bot)

    @commands.Cog.listener()
    async def on_guild_join(self, guild: discord.Guild):
        logger.info(f"Joined new guild: {guild.name} ({guild.id})")
        
        # Find a suitable channel to send welcome message
        channel = guild.system_channel
        if not channel:
            for c in guild.text_channels:
                if c.permissions_for(guild.me).send_messages:
                    channel = c
                    break
        
        if channel:
            embed = EmbedUtils.success(
                "🗝️ Roblox Keys Installed!",
                "Thanks for adding Roblox Keys.\n\nType `/setup` to initialize the ticket system and configure your shop.\nType `/help` to see all commands."
            )
            try:
                await channel.send(embed=embed)
            except:
                pass

    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member):
        from ..services.database import GuildConfig, AutoRoleConfig
        from ..utils.welcome_card import build_welcome_card_file

        autorole = await AutoRoleConfig.filter(guild_id=str(member.guild.id)).first()
        if autorole and str(autorole.role_id).isdigit():
            role = member.guild.get_role(int(autorole.role_id))
            if role:
                try:
                    await member.add_roles(role, reason="Autorole assignment")
                except Exception as e:
                    logger.error(f"Failed to assign autorole for {member.id}: {e}")
        
        config = await GuildConfig.filter(id=str(member.guild.id)).first()
        if not config or not config.welcome_channel_id:
            return
            
        channel = member.guild.get_channel(int(config.welcome_channel_id))
        if not channel:
            return
            
        try:
            file = await build_welcome_card_file(self.bot, member)
            await channel.send(f"Welcome {member.mention} to **{member.guild.name}**!", file=file)
        except Exception as e:
            logger.error(f"Failed to send welcome card: {e}")

    @commands.Cog.listener()
    async def on_command_error(self, ctx, error):
        # Fallback for old style commands if any
        if isinstance(error, commands.CommandNotFound):
            return
        logger.error(f"Command error: {error}")

    @commands.Cog.listener()
    async def on_app_command_completion(self, interaction: discord.Interaction, command: app_commands.Command):
        """Log every slash command usage to the configured log channel."""
        try:
            guild_id = str(interaction.guild_id) if interaction.guild else None
            if not guild_id:
                return

            config = await GuildConfig.filter(id=guild_id).first()
            if config and config.cmd_log_channel_id:
                channel = interaction.guild.get_channel(int(config.cmd_log_channel_id))
                if channel:
                    user = interaction.user
                    # Format log embed
                    embed = discord.Embed(
                        description=f"**Command Used**\nUser: {user.mention} (`{user.id}`)\nCommand: `/{command.name}`\nChannel: {interaction.channel.mention}",
                        color=Colors.INFO,
                        timestamp=datetime.now()
                    )
                    embed.set_author(name=f"{user.name}", icon_url=user.display_avatar.url)
                    
                    await channel.send(embed=embed)
        except Exception as e:
            logger.error(f"Failed to log command usage: {e}")

async def setup(bot):
    await bot.add_cog(GeneralListeners(bot))


