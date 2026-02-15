import discord
from discord import app_commands
from discord.ext import commands
import os
import sys
import traceback
from typing import List, Optional
from .utils.logger import logger
from .utils.constants import Emojis, Colors
from .utils.components_v2 import patch_components_v2
from .services.database import init_db
from .services.web_bridge import WebsiteBridgeServer

class RobloxKeysBot(commands.Bot):
    def __init__(self):
        intents = discord.Intents.all()
        super().__init__(
            command_prefix=commands.when_mentioned,
            intents=intents,
            help_command=None,
            activity=discord.Activity(type=discord.ActivityType.watching, name="Loading System...")
        )
        self.persistent_views_added = False
        self.commands_synced = False
        self.website_bridge: Optional[WebsiteBridgeServer] = None

    async def setup_hook(self):
        """
        Advanced setup hook for initializing DB, loading extensions, and syncing commands.
        """
        logger.info(f"{Emojis.STORE}  Initializing Roblox Keys System...")
        
        # 0. Apply Components V2 Patch
        patch_components_v2()
        logger.info(f"{Emojis.SUCCESS} Components V2 patch applied.")
        
        # 1. Initialize Database
        try:
            await init_db()
            logger.info(f"{Emojis.SUCCESS} Database connection established.")
        except Exception as e:
            logger.critical(f"{Emojis.ERROR} Database failed to initialize: {e}")
            sys.exit(1)

        # 2. Start website bridge API
        try:
            self.website_bridge = WebsiteBridgeServer(self)
            await self.website_bridge.start()
            logger.info(f"{Emojis.SUCCESS} Website bridge started.")
        except Exception as e:
            logger.error(f"{Emojis.ERROR} Website bridge failed to start: {e}")

        # 3. Load Extensions (Commands & Events)
        await self.load_extensions()

        # 4. Sync commands after the bot is ready so all guilds are available.

    async def load_extensions(self):
        """
        Recursively loads all extensions from the src directory.
        """
        # Load Cogs/Commands
        commands_dir = os.path.join(os.path.dirname(__file__), 'commands')
        if os.path.exists(commands_dir):
            for filename in os.listdir(commands_dir):
                if filename.endswith('.py') and not filename.startswith('_'):
                    extension_name = f"src.commands.{filename[:-3]}"
                    try:
                        await self.load_extension(extension_name)
                        logger.info(f"Loaded extension: {extension_name}")
                    except Exception as e:
                        logger.error(f"{Emojis.ERROR} Failed to load extension {extension_name}: {e}\n{traceback.format_exc()}")

        # Load Events (Manually or via a loader if they are cogs, otherwise we register them)
        # For this architecture, we will load events as Cogs or direct listeners.
        # Let's assume events are in a 'cogs' style for cleanliness or loaded here.
        events_dir = os.path.join(os.path.dirname(__file__), 'events')
        if os.path.exists(events_dir):
            for filename in os.listdir(events_dir):
                if filename.endswith('.py') and not filename.startswith('_'):
                    extension_name = f"src.events.{filename[:-3]}"
                    try:
                         # For events files, we assume they have a setup function or we treat them as extensions
                        await self.load_extension(extension_name)
                        logger.info(f"Loaded event module: {extension_name}")
                    except Exception as e:
                         logger.error(f"{Emojis.ERROR} Failed to load event module {extension_name}: {e}")

    async def on_ready(self):
        logger.info(f"{Emojis.ROCKET}  {self.user} is online and ready!")
        logger.info(f"ID: {self.user.id}")
        logger.info(f"Guilds: {len(self.guilds)}")

        if not self.commands_synced:
            await self.sync_app_commands()
            self.commands_synced = True
        
        # Set dynamic presence
        await self.change_presence(
            status=discord.Status.online,
            activity=discord.Activity(
                type=discord.ActivityType.competing, 
                name=f"Manage {len(self.guilds)} Shops | /help"
            )
        )

    async def on_error(self, event_method: str, *args, **kwargs):
        logger.error(f"Error in event {event_method}: {sys.exc_info()}")
        traceback.print_exc()

    async def sync_app_commands(self):
        """
        Sync application commands to guilds for immediate availability,
        then sync globally.
        """
        target_guild_id = (os.getenv("DISCORD_GUILD_ID") or os.getenv("SYNC_GUILD_ID") or "").strip()
        guild_targets = []

        if target_guild_id.isdigit():
            guild = self.get_guild(int(target_guild_id))
            if guild:
                guild_targets = [guild]
            else:
                logger.warning(f"{Emojis.WARNING} Configured guild {target_guild_id} not found; falling back to all guilds.")
                guild_targets = list(self.guilds)
        else:
            guild_targets = list(self.guilds)

        for guild in guild_targets:
            try:
                self.tree.copy_global_to(guild=guild)
                guild_synced = await self.tree.sync(guild=guild)
                logger.info(f"{Emojis.INFO} Synced {len(guild_synced)} commands to guild {guild.id}.")
            except Exception as e:
                logger.error(f"{Emojis.ERROR} Guild command sync failed for {guild.id}: {e}")

        try:
            global_synced = await self.tree.sync()
            logger.info(f"{Emojis.INFO} Synced {len(global_synced)} application commands globally.")
        except Exception as e:
            logger.error(f"{Emojis.ERROR} Global command sync failed: {e}")

    async def on_app_command_error(self, interaction: discord.Interaction, error: app_commands.AppCommandError):
        original = getattr(error, "original", error)
        logger.error(f"App command error: {original}")

        message = f"{Emojis.ERROR} Command failed: {original}"
        if interaction.response.is_done():
            try:
                await interaction.followup.send(message, ephemeral=True)
            except Exception:
                pass
            return
        try:
            await interaction.response.send_message(message, ephemeral=True)
        except Exception:
            pass

    async def close(self):
        if self.website_bridge is not None:
            await self.website_bridge.stop()
            self.website_bridge = None
        await super().close()

bot = RobloxKeysBot()


