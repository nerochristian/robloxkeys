import discord
from discord import app_commands, ui
from discord.ext import commands
import asyncio
import re
import os
import aiohttp
from typing import Optional, Literal
from ..utils.base_cog import BaseCog
from ..utils.embeds import EmbedUtils
from ..utils.constants import Emojis, Colors
from ..utils.v2_builders import (
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    ThumbnailBuilder,
    SeparatorSpacingSize,
    send_v2_message
)
from ..services.database import Ticket, GuildConfig
from ..services.transcript_service import generate_transcript
from tortoise.transactions import in_transaction
from ..utils.logger import logger

DEFAULT_SERVER_LOGO = (
    os.getenv("BRAND_LOGO_URL")
    or "https://cdn.discordapp.com/icons/1388303592502333530/9d7828a6890fa9cbd6ce373d295992b3.webp?size=512&quality=lossless"
)
DEFAULT_SERVER_BANNER = (
    os.getenv("BRAND_BANNER_URL")
    or "https://cdn.discordapp.com/banners/1388303592502333530/f51da5b94a949ddd93ce874a8f58176a.webp?size=1024"
)


async def _resolve_brand_assets(bot: discord.Client) -> tuple[str, str]:
    logo_url = DEFAULT_SERVER_LOGO
    banner_url = DEFAULT_SERVER_BANNER

    bridge = getattr(bot, "website_bridge", None)
    if bridge is None:
        return logo_url, banner_url

    try:
        settings = await bridge._load_state("settings")
    except Exception as exc:
        logger.warning(f"Failed to load branding settings for tickets: {exc}")
        return logo_url, banner_url

    if isinstance(settings, dict):
        logo_url = str(settings.get("logoUrl") or logo_url or "").strip() or logo_url
        banner_url = str(settings.get("bannerUrl") or banner_url or "").strip() or banner_url

    return logo_url, banner_url

class TicketPanelSelect(discord.ui.Select):
    def __init__(self, emoji_map: Optional[dict[str, discord.Emoji]] = None):
        def _emoji(name: str, fallback: str):
            if emoji_map:
                emoji = emoji_map.get(name)
                if emoji:
                    return emoji
            return fallback

        options = [
            discord.SelectOption(label="Support Ticket", value="support", emoji=_emoji("magnifying_glass", "❓"), description="Get help with general issues"),
            discord.SelectOption(label="Get a Replacement", value="replacement", emoji=_emoji("settings", "⚙️"), description="Request a replacement for an order"),
            discord.SelectOption(label="Product Not Received", value="notreceived", emoji=_emoji("no", "🚫"), description="Didn't receive your product"),
            discord.SelectOption(label="Purchase a Product", value="purchase", emoji=_emoji("shop", "🛒"), description="Inquiries about buying products")
        ]
        super().__init__(
            placeholder="Select a ticket type...",
            min_values=1,
            max_values=1,
            options=options,
            custom_id="panel:select"
        )

    async def callback(self, interaction: discord.Interaction):
        value = self.values[0]
        await interaction.response.defer(ephemeral=True)

        details_text = "No details provided."
        if value == "replacement":
            details_text = "**Invoice ID:** Not provided\n**Details:** No details provided."

        await Tickets.create_ticket(interaction, value, details_text)

class TicketPanelView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)
        self.add_item(TicketPanelSelect())

class TicketDetailsModal(discord.ui.Modal):
    def __init__(self, category: str, title: str):
        super().__init__(title=title, timeout=300)
        self.category = category

        self.details = discord.ui.TextInput(
            label="How can we help you?",
            placeholder="Please describe your issue or request in detail...",
            required=True,
            style=discord.TextStyle.paragraph,
            max_length=1000,
        )
        self.add_item(self.details)

        if category == "replacement":
             self.order_id = discord.ui.TextInput(
                label="Invoice ID",
                placeholder="e.g. 123456789",
                required=True,
                max_length=100
            )
             self.add_item(self.order_id)

    async def on_submit(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True)
        
        details_text = self.details.value
        if hasattr(self, 'order_id'):
            details_text = f"**Invoice ID:** {self.order_id.value}\n**Details:** {details_text}"

        await Tickets.create_ticket(interaction, self.category, details_text)


async def build_ticket_container(
    bot: discord.Client,
    category: str,
    details: str,
    claimed_by: Optional[discord.Member] = None,
):

    
    # Title mapping
    title_map = {
        "replacement": "Replace Ticket",
        "notreceived": "Product not received Ticket",
        "purchase": "Purchase Ticket",
        "support": "Support Ticket"
    }
    title = title_map.get(category, f"{category.capitalize()} Ticket")
    
    # Requirements mapping
    requirements_map = {
        "replacement": (
            "🔧 **Replacement Requirements**\n\n"
            "Please provide the following information so staff can verify your case:\n"
            "• **Video** accessing the account.\n"
            "• **Invoice ID**.\n"
            "• **Full proof** of payment.\n"
            "• **Email** used for payment."
        ),
        "purchase": (
            "🛒 **Purchase Inquiry**\n\n"
            "Please provide the following information:\n"
            "• **Product** you want to purchase.\n"
            "• **Payment method** you prefer.\n"
            "• Any **questions** you have."
        ),
        "notreceived": (
            "📦 **Product Not Received**\n\n"
            "Please provide the following information so staff can verify your case:\n"
            "• **Invoice ID**.\n"
            "• **Full proof** of payment.\n"
            "• **Email** used for payment."
        ),
        "support": (
            "❓ **Required Information**\n\n"
            "Please provide the following information to assist you better:\n"
            f"• {details}"
        )
    }
    info_text = requirements_map.get(category, requirements_map["support"])
    
    # Claimed by text
    if claimed_by:
        claimed_text = f"**Claimed by**\n{claimed_by.mention} ({claimed_by.name})"
    else:
        claimed_text = "**Claimed by**\n*Unclaimed*"
    
    logo_url, _ = await _resolve_brand_assets(bot)

    # Build container using Builder pattern
    container = ContainerBuilder()
    container.setAccentColor(Colors.INFO)
    
    # Thumbnail in top right (your logo)
    container.addAccessoryComponents(
        ThumbnailBuilder().setMediaUrl(logo_url)
    )
    
    # Title and main description
    container.addTextDisplayComponents(
        TextDisplayBuilder().setContent(
            f"**{title}**\n\n"
            "Please wait until one of our support team members can help you. "
            "**Response time may vary to many factors, so please be patient.**"
        )
    )
    
    # Separator line
    container.addSeparatorComponents(
        SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(True)
    )
    
    # Requirements section
    container.addTextDisplayComponents(
        TextDisplayBuilder().setContent(info_text)
    )
    
    # Another separator
    container.addSeparatorComponents(
        SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(True)
    )
    
    # Claimed by section
    container.addTextDisplayComponents(
        TextDisplayBuilder().setContent(claimed_text)
    )
    
    # Buttons inside the container
    container.addActionRowComponents(
        ActionRowBuilder()
        .addComponents(
            ButtonBuilder()
            .setStyle(ButtonStyle.Danger)
            .setLabel("🚫 Close")
            .setCustomId("ticket:close"),
            
            ButtonBuilder()
            .setStyle(ButtonStyle.Success)
            .setLabel("👋 Claim")
            .setCustomId("ticket:claim")
        )
    )
    
    return container


class TicketControlView(discord.ui.LayoutView):

    
    def __init__(
        self,
        category: str,
        details: str,
        ticket_num: int,
        user: discord.Member,
        claimed_by: Optional[discord.Member] = None,
        logo_url: Optional[str] = None,
    ):
        super().__init__(timeout=None)
        self.category = category
        self.ticket_num = ticket_num
        self.creator = user
        self.logo_url = str(logo_url or DEFAULT_SERVER_LOGO).strip() or DEFAULT_SERVER_LOGO
        
        # Build using the async helper synchronously in __init__
        # We'll build it manually here to avoid async issues
        container = self._build_container(category, details, claimed_by)
        self.add_item(container)
    
    def _build_container(self, category: str, details: str, claimed_by: Optional[discord.Member] = None) -> discord.ui.Container:

        
        title_map = {
            "replacement": "Replace Ticket",
            "notreceived": "Product not received Ticket",
            "purchase": "Purchase Ticket",
            "support": "Support Ticket"
        }
        title = title_map.get(category, f"{category.capitalize()} Ticket")
        
        requirements_map = {
            "replacement": (
                "🔧 **Replacement Requirements**\n\n"
                "Please provide the following information so staff can verify your case:\n"
                "• **Video** accessing the account.\n"
                "• **Invoice ID**.\n"
                "• **Full proof** of payment.\n"
                "• **Email** used for payment."
            ),
            "purchase": (
                "🛒 **Purchase Inquiry**\n\n"
                "Please provide the following information:\n"
                "• **Product** you want to purchase.\n"
                "• **Payment method** you prefer.\n"
                "• Any **questions** you have."
            ),
            "notreceived": (
                "📦 **Product Not Received**\n\n"
                "Please provide the following information so staff can verify your case:\n"
                "• **Invoice ID**.\n"
                "• **Full proof** of payment.\n"
                "• **Email** used for payment."
            ),
            "support": (
                "❓ **Required Information**\n\n"
                "Please provide the following information to assist you better:\n"
                f"• {details}"
            )
        }
        info_text = requirements_map.get(category, requirements_map["support"])
        
        claimed_text = f"**Claimed by**\n{claimed_by.mention} ({claimed_by.name})" if claimed_by else "**Claimed by**\n*Unclaimed*"
        
        # Build container
        container = discord.ui.Container(accent_color=Colors.INFO)
        
        # Header with thumbnail
        header_content = (
            f"**{title}**\n\n"
            "Please wait until one of our support team members can help you. "
            "**Response time may vary to many factors, so please be patient.**"
        )
        container.add_item(
            discord.ui.Section(
                discord.ui.TextDisplay(header_content),
                accessory=discord.ui.Thumbnail(self.logo_url)
            )
        )
        
        # Separator
        container.add_item(discord.ui.Separator(spacing=discord.SeparatorSpacing.small))
        
        # Requirements
        container.add_item(discord.ui.TextDisplay(info_text))
        
        # Separator
        container.add_item(discord.ui.Separator(spacing=discord.SeparatorSpacing.small))
        
        # Claimed by
        container.add_item(discord.ui.TextDisplay(claimed_text))
        
        # Buttons
        close_btn = discord.ui.Button(label="🚫 Close", style=discord.ButtonStyle.danger, custom_id="ticket:close")
        claim_btn = discord.ui.Button(label="👋 Claim", style=discord.ButtonStyle.success, custom_id="ticket:claim")
        
        close_btn.callback = self._close_callback
        claim_btn.callback = self._claim_callback
        
        container.add_item(discord.ui.ActionRow(close_btn, claim_btn))
        
        return container

    async def _close_callback(self, interaction: discord.Interaction):
        await interaction.response.defer()
        await Tickets.close_ticket(interaction.channel, interaction.user)

    async def _claim_callback(self, interaction: discord.Interaction):
        await Tickets.claim_ticket(interaction)

class TranscriptView(discord.ui.View):
    def __init__(self, transcript_html: str, filename: str):
        super().__init__(timeout=None)
        self.transcript_html = transcript_html
        self.filename = filename

    @discord.ui.button(label="Download Transcript", style=discord.ButtonStyle.primary, emoji="📥")
    async def download_transcript(self, interaction: discord.Interaction, button: discord.ui.Button):
        import io
        f = discord.File(
            io.BytesIO(self.transcript_html.encode('utf-8')),
            filename=self.filename
        )
        await interaction.response.send_message(
            f"Here is the transcript for **{self.filename}**:",
            file=f,
            ephemeral=True
        )

class TicketBlockView(discord.ui.View):
    def __init__(self, ticket_channel_id: int, target_user_id: int):
        super().__init__(timeout=None)
        self.ticket_channel_id = ticket_channel_id
        self.target_user_id = target_user_id

    @discord.ui.button(label="Unblock Ticket", style=discord.ButtonStyle.secondary)
    async def unblock_ticket(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not interaction.user.guild_permissions.manage_channels:
            return await interaction.response.send_message("Staff only.", ephemeral=True)
        await Tickets.unblock_ticket_from_view(
            interaction,
            ticket_channel_id=self.ticket_channel_id,
            target_user_id=self.target_user_id,
        )

    @discord.ui.button(label="Request Unblock", style=discord.ButtonStyle.primary)
    async def request_unblock(self, interaction: discord.Interaction, button: discord.ui.Button):
        await Tickets.request_unblock_from_view(
            interaction,
            ticket_channel_id=self.ticket_channel_id,
            target_user_id=self.target_user_id,
        )

class UnblockRequestView(discord.ui.View):
    def __init__(self, ticket_channel_id: int, target_user_id: int):
        super().__init__(timeout=None)
        self.ticket_channel_id = ticket_channel_id
        self.target_user_id = target_user_id

    @discord.ui.button(label="Unblock Ticket", style=discord.ButtonStyle.secondary)
    async def unblock_ticket(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not interaction.user.guild_permissions.manage_channels:
            return await interaction.response.send_message("Staff only.", ephemeral=True)
        await Tickets.unblock_ticket_from_view(
            interaction,
            ticket_channel_id=self.ticket_channel_id,
            target_user_id=self.target_user_id,
        )

class Tickets(BaseCog):
    def __init__(self, bot):
        super().__init__(bot)

    async def cog_load(self):
        if not self.bot.persistent_views_added:
            self.bot.add_view(TicketPanelView())
            # Note: TicketControlView is dynamic and created per-ticket, not persistent
            self.bot.persistent_views_added = True

    @staticmethod
    def _get_guild_emoji(guild: discord.Guild, name: str) -> Optional[discord.Emoji]:
        for emoji in guild.emojis:
            if emoji.name == name:
                return emoji
        return None

    @staticmethod
    async def ensure_panel_emojis(
        guild: discord.Guild,
        setup_log: Optional[list[str]] = None,
        force_update: bool = False,
    ) -> dict[str, Optional[discord.Emoji]]:
        emoji_sources = {
            "settings": "https://media.discordapp.net/attachments/1275985441362808853/1460674824123846800/setting.png?ex=6967c6f0&is=69667570&hm=3ece4a01bed90c2666d7aaf5ff0ee3cce81e6541f4be37540f9e508e9a01f42a&=&format=webp&quality=lossless",
            "shop": "https://media.discordapp.net/attachments/1275985441362808853/1460674824446677083/shop.png?ex=6967c6f0&is=69667570&hm=1a040c21de9a8b95a84941cf330859f9909d5877ef1be33577b2ce1e5a622bfa&=&format=webp&quality=lossless",
            "no": "https://media.discordapp.net/attachments/1275985441362808853/1460674824912503094/no.png?ex=6967c6f0&is=69667570&hm=bb0819020d242dfe5af144d4d7b3cc6f8297a776542bf83abe649bc60dad43db&=&format=webp&quality=lossless",
            "arrow": "https://media.discordapp.net/attachments/1275985441362808853/1460674825268891917/arrow.png?ex=6967c6f0&is=69667570&hm=fab630bd6e627ab5b7a3baf552609a346f9bca78c3d376fcc5e15da438bc1461&=&format=webp&quality=lossless",
            "strong": "https://media.discordapp.net/attachments/1275985441362808853/1460674825889775772/strong.png?ex=6967c6f0&is=69667570&hm=5aae5759c95f5f4be7be8bcb1215f277071799188df60a76c23101c6b6a1575b&=&format=webp&quality=lossless",
            "bot": "https://media.discordapp.net/attachments/1275985441362808853/1460674826380382218/bot.png?ex=6967c6f0&is=69667570&hm=2c9710fae413cf9c6c7cb09eacdc2603dee85b3600dee59fd72476c814d2f8bf&=&format=webp&quality=lossless",
            "magnifying_glass": "https://media.discordapp.net/attachments/1275985441362808853/1460674826795487253/mag.png?ex=6967c6f0&is=69667570&hm=2386ee27469a38a95a9e73c4f02ba1d64e016f01fd65b75efc53c7ec91bf2693&=&format=webp&quality=lossless",
        }

        emoji_map: dict[str, Optional[discord.Emoji]] = {}
        for name, url in emoji_sources.items():
            emoji = Tickets._get_guild_emoji(guild, name)
            if emoji and not force_update:
                emoji_map[name] = emoji
                continue
            if emoji and force_update:
                try:
                    await emoji.delete(reason="Refreshing panel emoji")
                except Exception as e:
                    if setup_log is not None:
                        setup_log.append(f"⚠️ Failed to delete emoji `{name}`: {e}")
                    emoji_map[name] = emoji
                    continue

            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(url) as resp:
                        if resp.status != 200:
                            if setup_log is not None:
                                setup_log.append(f"⚠️ Failed to download emoji `{name}` (HTTP {resp.status})")
                            emoji_map[name] = None
                            continue
                        image_data = await resp.read()

                emoji = await guild.create_custom_emoji(name=name, image=image_data)
                emoji_map[name] = emoji
                if setup_log is not None:
                    setup_log.append(f"✅ Created emoji `{name}`")
            except Exception as e:
                emoji_map[name] = None
                if setup_log is not None:
                    setup_log.append(f"⚠️ Failed to create emoji `{name}`: {e}")

        return emoji_map

    @staticmethod
    def _ticket_category_name(category: str) -> Optional[str]:
        category_map = {
            "support": "[SUPPORT]",
            "notreceived": "[NOT RECEIVED]",
            "replacement": "[REPLACE]",
        }
        return category_map.get(category)

    @staticmethod
    def _ticket_channel_prefix(category: str) -> str:
        prefix_map = {
            "support": "⛔",
            "notreceived": "❓",
            "replacement": "😡",
            "purchase": "⛔",
        }
        return prefix_map.get(category, "⛔")

    @staticmethod
    def _normalize_ticket_name(name: str) -> str:
        normalized = (name or "").strip()
        normalized = re.sub(r"\s+", "-", normalized)
        normalized = normalized.strip("-")
        return normalized or "ticket"

    @staticmethod
    def _build_ticket_channel_name(category: str, member: discord.Member) -> str:
        prefix = Tickets._ticket_channel_prefix(category)
        name = Tickets._normalize_ticket_name(member.display_name)
        channel_name = f"{prefix} • {name}"
        return channel_name[:100]

    @staticmethod
    def _is_ticket_member_blocked(channel: discord.TextChannel, member: discord.Member) -> bool:
        overwrite = channel.overwrites_for(member)
        return overwrite.send_messages is False

    @staticmethod
    async def _set_ticket_member_blocked(
        channel: discord.TextChannel,
        member: discord.Member,
        blocked: bool,
    ) -> None:
        overwrite = channel.overwrites_for(member)
        overwrite.send_messages = False if blocked else True
        overwrite.add_reactions = False if blocked else None
        await channel.set_permissions(member, overwrite=overwrite)

    @staticmethod
    async def _resolve_ticket_member(
        guild: discord.Guild,
        user_id: int,
    ) -> Optional[discord.Member]:
        member = guild.get_member(user_id)
        if member is None:
            try:
                member = await guild.fetch_member(user_id)
            except Exception:
                return None
        return member

    @staticmethod
    def _find_unblock_requests_channel(
        guild: discord.Guild,
    ) -> Optional[discord.TextChannel]:
        for channel in guild.text_channels:
            if "unblock-requests" in channel.name:
                return channel
        return None

    @staticmethod
    def _build_ticket_blocked_embed(
        actor: discord.Member,
        reason: str,
    ) -> discord.Embed:
        description = (
            f"This ticket was blocked by staff {actor.mention} for the following reason:\n"
            f"{reason}\n\n"
            "You can request that this ticket be unblocked whenever you want."
        )
        return discord.Embed(
            title="Ticket Blocked",
            description=description,
            color=Colors.WARNING,
        )

    @staticmethod
    def _build_ticket_unblocked_embed(
        actor: discord.Member,
    ) -> discord.Embed:
        description = (
            f"This ticket has been unblocked by staff {actor.mention}.\n\n"
            "This ticket is now active and open for discussion."
        )
        return discord.Embed(
            title="Ticket Unblocked",
            description=description,
            color=Colors.SUCCESS,
        )

    @staticmethod
    def _build_unblock_request_embed(
        requester: discord.Member,
        ticket_channel: discord.TextChannel,
        target: Optional[discord.Member],
        target_user_id: int,
    ) -> discord.Embed:
        target_text = target.mention if target else f"<@{target_user_id}>"
        description = (
            f"User {target_text} requires this ticket to be unblocked, please review it.\n"
            f"Channel: {ticket_channel.mention}"
        )
        embed = discord.Embed(
            title="Unblock Request",
            description=description,
            color=Colors.WARNING,
        )
        embed.set_footer(text=f"Request by {requester}")
        return embed

    @staticmethod
    async def unblock_ticket_from_view(
        interaction: discord.Interaction,
        ticket_channel_id: int,
        target_user_id: int,
    ) -> None:
        await interaction.response.defer(ephemeral=True)
        guild = interaction.guild
        if guild is None:
            return await interaction.followup.send("Guild not found.", ephemeral=True)

        channel = guild.get_channel(ticket_channel_id)
        if channel is None:
            try:
                channel = await guild.fetch_channel(ticket_channel_id)
            except Exception:
                channel = None
        if not isinstance(channel, discord.TextChannel):
            return await interaction.followup.send("Ticket channel not found.", ephemeral=True)

        target = await Tickets._resolve_ticket_member(guild, target_user_id)
        if not target:
            return await interaction.followup.send("User not found.", ephemeral=True)

        if not Tickets._is_ticket_member_blocked(channel, target):
            return await interaction.followup.send("That user is not blocked in this ticket.", ephemeral=True)

        await Tickets._set_ticket_member_blocked(channel, target, blocked=False)
        await channel.send(embed=Tickets._build_ticket_unblocked_embed(interaction.user))
        await interaction.followup.send("Ticket unblocked.", ephemeral=True)

    @staticmethod
    async def request_unblock_from_view(
        interaction: discord.Interaction,
        ticket_channel_id: int,
        target_user_id: int,
    ) -> None:
        await interaction.response.defer(ephemeral=True)
        guild = interaction.guild
        if guild is None:
            return await interaction.followup.send("Guild not found.", ephemeral=True)

        if interaction.user.id != target_user_id and not interaction.user.guild_permissions.manage_channels:
            return await interaction.followup.send(
                "Only the blocked user or staff can request an unblock.",
                ephemeral=True,
            )

        request_channel = Tickets._find_unblock_requests_channel(guild)
        if not request_channel:
            return await interaction.followup.send("Unblock requests channel not found.", ephemeral=True)

        ticket_channel = guild.get_channel(ticket_channel_id)
        if ticket_channel is None:
            try:
                ticket_channel = await guild.fetch_channel(ticket_channel_id)
            except Exception:
                ticket_channel = None
        if not isinstance(ticket_channel, discord.TextChannel):
            return await interaction.followup.send("Ticket channel not found.", ephemeral=True)

        target = await Tickets._resolve_ticket_member(guild, target_user_id)
        if target and not Tickets._is_ticket_member_blocked(ticket_channel, target):
            return await interaction.followup.send("That user is not blocked in this ticket.", ephemeral=True)

        embed = Tickets._build_unblock_request_embed(
            interaction.user,
            ticket_channel,
            target,
            target_user_id,
        )
        view = UnblockRequestView(ticket_channel.id, target_user_id)
        await request_channel.send(embed=embed, view=view)
        await interaction.followup.send("Unblock request sent.", ephemeral=True)

    @app_commands.command(name="setup", description="Complete ticket system setup - creates everything automatically")
    async def setup(self, interaction: discord.Interaction):
        if not interaction.user.guild_permissions.administrator:
            return await interaction.response.send_message("Admin only.", ephemeral=True)
            
        await interaction.response.defer(ephemeral=True)
        setup_log = []
        guild = interaction.guild

        # ------------------------------------------------------------------
        # 1. CREATE STAFF ROLE
        # ------------------------------------------------------------------
        role = discord.utils.get(guild.roles, name="Staff")
        if not role:
            try:
                role = await guild.create_role(name="Staff", color=discord.Color.blue(), hoist=True, mentionable=True)
                setup_log.append(f"✅ Created Staff role: {role.mention}")
            except Exception as e:
                setup_log.append(f"⚠️ Failed to create Staff role: {e}")
        else:
            setup_log.append(f"✅ Found existing Staff role: {role.mention}")

        # ------------------------------------------------------------------
        # DEFINITIONS
        # ------------------------------------------------------------------
        # Permissions
        overwrites_staff_only = {
            guild.default_role: discord.PermissionOverwrite(read_messages=False),
            guild.me: discord.PermissionOverwrite(read_messages=True, send_messages=True, manage_channels=True)
        }
        if role:
            overwrites_staff_only[role] = discord.PermissionOverwrite(read_messages=True, send_messages=True)

        overwrites_public_read = {
            guild.default_role: discord.PermissionOverwrite(read_messages=True, send_messages=False),
            guild.me: discord.PermissionOverwrite(read_messages=True, send_messages=True, embed_links=True)
        }
        if role:
            overwrites_public_read[role] = discord.PermissionOverwrite(read_messages=True, send_messages=True, manage_messages=True)

        # Structure to create
        structure = {
            "Support & Panels": {
                "channels": ["📩・support"],
                "overwrites": overwrites_public_read
            },
            "Logs & Tickets": {
                "channels": [
                    "📄・tickets-logs",
                    "🔓・unblock-requests",
                    "📁・moved-tickets",
                    "🧹・tickets-cleanup",
                    "💻・commands-logs"
                ],
                "overwrites": overwrites_staff_only
            },
            "Private & Logs": {
                "channels": [
                    "🤖・bot-logs",
                    "📝・replace-logs",
                    "🔍・replace-reviews",
                    "⏱️・tickets-delay",
                    "📋・replace-logs-2",
                    "🧾・logs-invoices"
                ],
                "overwrites": overwrites_staff_only
            },
            "Staffs & Configs": {
                "channels": [
                    "🤖・bots-cmds",
                    "🛠️・config",
                    "🎨・designs"
                ],
                "overwrites": overwrites_staff_only
            }
        }

        created_channels = {}

        # ------------------------------------------------------------------
        # CREATE STRUCTURE
        # ------------------------------------------------------------------
        for cat_name, details in structure.items():
            cat = discord.utils.get(guild.categories, name=cat_name)
            if not cat:
                try:
                    cat = await guild.create_category(cat_name, overwrites=details["overwrites"])
                    setup_log.append(f"📂 Created Category: **{cat_name}**")
                except Exception as e:
                    setup_log.append(f"❌ Failed Category {cat_name}: {e}")
                    continue
            else:
                setup_log.append(f"📂 Found Category: **{cat_name}**")

            for chan_name in details["channels"]:
                chan = discord.utils.get(guild.text_channels, name=chan_name, category=cat)
                if not chan:
                    try:
                        chan = await guild.create_text_channel(chan_name, category=cat, overwrites=details["overwrites"])
                        setup_log.append(f"  └─ ✅ Created {chan.mention}")
                    except Exception as e:
                        setup_log.append(f"  └─ ❌ Failed {chan_name}: {e}")
                else:
                    setup_log.append(f"  └─ ✅ Found {chan.mention}")
                
                created_channels[chan_name] = chan

        # ------------------------------------------------------------------
        # CONFIGURATION MAPPING
        # ------------------------------------------------------------------
        # Map specific channels to DB config
        panel_channel = created_channels.get("📩・support")
        transcript_channel = created_channels.get("📄・tickets-logs")
        cmd_log_channel = created_channels.get("💻・commands-logs")
        
        # Create separate categories for each ticket type.
        ticket_category_names = ["[SUPPORT]", "[NOT RECEIVED]", "[REPLACE]"]
        ticket_categories = {}
        overwrites_ticket_cat = {
            guild.default_role: discord.PermissionOverwrite(read_messages=False),
            guild.me: discord.PermissionOverwrite(read_messages=True, manage_channels=True)
        }
        if role:
            overwrites_ticket_cat[role] = discord.PermissionOverwrite(read_messages=True, send_messages=True)

        for name in ticket_category_names:
            cat = discord.utils.get(guild.categories, name=name)
            if not cat:
                cat = await guild.create_category(name, overwrites=overwrites_ticket_cat)
                setup_log.append(f"📂 Created **{name}** category for open tickets")
            ticket_categories[name] = cat

        ticket_cat = ticket_categories.get("[SUPPORT]")

        await GuildConfig.update_or_create(
            id=str(guild.id), 
            defaults={
                "ticket_category_id": str(ticket_cat.id) if ticket_cat else None,
                "staff_role_id": str(role.id) if role else None,
                "log_channel_id": str(transcript_channel.id) if transcript_channel else None,
                "cmd_log_channel_id": str(cmd_log_channel.id) if cmd_log_channel else None,
                "panel_channel_id": str(panel_channel.id) if panel_channel else None,
                "setup_completed": True
            }
        )
        setup_log.append("💾 Setup configuration saved.")

        emoji_map = await Tickets.ensure_panel_emojis(guild, setup_log, force_update=True)
        logo_url, banner_url = await _resolve_brand_assets(self.bot)

        # ------------------------------------------------------------------
        # POST PANEL
        # ------------------------------------------------------------------
        if panel_channel:
            try:
                # Build Components V2 panel
                container = discord.ui.Container(accent_color=Colors.INFO)
                container.add_item(discord.ui.MediaGallery(discord.MediaGalleryItem(banner_url)))
                container.add_item(discord.ui.Separator(spacing=discord.SeparatorSpacing.small))
                
                header_content = (
                    "**🎫 Ticket System**\n"
                    "**Support ticket management**\n\n"
                    "If you need help, click on the option corresponding to the type of ticket you want to open.\n"
                    "**Response time may vary due to many factors, so please be patient.**"
                )
                container.add_item(
                    discord.ui.Section(
                        discord.ui.TextDisplay(header_content),
                        accessory=discord.ui.Thumbnail(logo_url)
                    )
                )
                
                class SetupPanelView(discord.ui.LayoutView):
                    def __init__(self):
                        super().__init__(timeout=None)
                        self.add_item(container)
                        container.add_item(discord.ui.ActionRow(TicketPanelSelect(emoji_map)))
                
                await panel_channel.send(view=SetupPanelView())
                setup_log.append(f"📨 Posted Ticket Panel in {panel_channel.mention}")
            except Exception as e:
                setup_log.append(f"⚠️ Failed to post panel: {e}")

        # ------------------------------------------------------------------
        # SUMMARY
        # ------------------------------------------------------------------
        summary_desc = "\n".join(setup_log)
        # Split if too long
        if len(summary_desc) > 4000:
            summary_desc = summary_desc[:4000] + "..."
            
        embed = discord.Embed(title="✅ Server Setup Complete", description=summary_desc, color=Colors.SUCCESS)
        await interaction.followup.send(embed=embed)
    @app_commands.command(name="set-logs", description="Set the channel for ticket transcripts and logs")
    @app_commands.describe(channel="The channel to send transcripts and logs to")
    async def set_logs(self, interaction: discord.Interaction, channel: discord.TextChannel):
        if not interaction.user.guild_permissions.administrator:
            return await interaction.response.send_message("Admin only.", ephemeral=True)
        
        await interaction.response.defer(ephemeral=True)
        
        # Update or create guild config with log channel
        await GuildConfig.update_or_create(
            id=str(interaction.guild_id),
            defaults={
                "log_channel_id": str(channel.id)
            }
        )
        
        await interaction.followup.send(
            embed=EmbedUtils.success(
                "Log Channel Set", 
                f"Ticket transcripts will now be sent to {channel.mention}\n\n"
                "When tickets are closed, transcripts will automatically be posted here."
            )
        )

    @app_commands.command(name="save-transcript", description="Save a transcript of the current channel")
    @app_commands.describe(limit="Number of messages to save (optional)")
    async def save_transcript(self, interaction: discord.Interaction, limit: Optional[int] = None):
        if not interaction.user.guild_permissions.administrator:
            return await interaction.response.send_message("Admin only.", ephemeral=True)
            
        await interaction.response.defer(ephemeral=True)
        
        try:
            transcript_data = await generate_transcript(interaction.channel, limit=limit)
            transcript_html = transcript_data["html"]
            
            import io
            f = discord.File(
                io.BytesIO(transcript_html.encode('utf-8')),
                filename=f"transcript-{interaction.channel.name}.html"
            )
            
            await interaction.followup.send(
                content=f"📝 Transcript for {interaction.channel.mention}",
                file=f
            )
        except Exception as e:
            await interaction.followup.send(f"❌ Failed to generate transcript: {e}", ephemeral=True)

    @app_commands.command(name="panel", description="Post the ticket panel")
    async def panel(self, interaction: discord.Interaction, channel: Optional[discord.TextChannel] = None):
        if not interaction.user.guild_permissions.administrator:
             return await interaction.response.send_message("Unauthorized.", ephemeral=True)
              
        target = channel or interaction.channel
        emoji_map = await Tickets.ensure_panel_emojis(target.guild)
        logo_url, banner_url = await _resolve_brand_assets(self.bot)
        
        # Build Components V2 panel with banner at top
        container = discord.ui.Container(accent_color=Colors.INFO)
        
        # Banner at the TOP (MediaGallery stretches to fill width)
        container.add_item(
            discord.ui.MediaGallery(
                discord.MediaGalleryItem(banner_url)
            )
        )
        
        # Separator after banner
        container.add_item(discord.ui.Separator(spacing=discord.SeparatorSpacing.small))
        
        # Title and description with logo thumbnail on the right
        header_content = (
            "**🎫 Ticket System**\n"
            "**Support ticket management**\n\n"
            "If you need help, click on the option corresponding to the type of ticket you want to open.\n"
            "**Response time may vary due to many factors, so please be patient.**"
        )
        container.add_item(
            discord.ui.Section(
                discord.ui.TextDisplay(header_content),
                accessory=discord.ui.Thumbnail(logo_url)
            )
        )
        
        # Create LayoutView and add the container + select dropdown
        class PanelLayoutView(discord.ui.LayoutView):
            def __init__(self):
                super().__init__(timeout=None)
                self.add_item(container)
                # Add the select menu in an ActionRow inside the container
                container.add_item(discord.ui.ActionRow(TicketPanelSelect(emoji_map)))
        
        await target.send(view=PanelLayoutView())
        await interaction.response.send_message(f"Panel posted in {target.mention}", ephemeral=True)

    @staticmethod
    async def create_ticket(interaction: discord.Interaction, category: str, details: str):
        guild = interaction.guild
        user = interaction.user
        
        # Fetch config
        config = await GuildConfig.filter(id=str(guild.id)).first()
        category_channel = None
        category_name = Tickets._ticket_category_name(category)
        if category_name:
            category_channel = discord.utils.get(guild.categories, name=category_name)
            if not category_channel:
                category_channel = await guild.create_category(category_name)

        if not category_channel:
            cat_id = int(config.ticket_category_id) if config and config.ticket_category_id else None
            category_channel = guild.get_channel(cat_id) if cat_id else discord.utils.get(guild.categories, name="Tickets")

        if not category_channel:
            category_channel = await guild.create_category("Tickets")

        # Determine Ticket Number
        last_ticket = await Ticket.filter(guild_id=str(guild.id)).order_by('-ticket_number').first()
        next_num = (last_ticket.ticket_number + 1) if last_ticket else 1
        
        # Create Channel
        overwrites = {
            guild.default_role: discord.PermissionOverwrite(read_messages=False),
            user: discord.PermissionOverwrite(read_messages=True, send_messages=True, attach_files=True),
            guild.me: discord.PermissionOverwrite(read_messages=True, send_messages=True, manage_channels=True)
        }
        
        if config and config.staff_role_id:
            staff_role = guild.get_role(int(config.staff_role_id))
            if staff_role:
                overwrites[staff_role] = discord.PermissionOverwrite(read_messages=True, send_messages=True)

        channel_name = Tickets._build_ticket_channel_name(category, user)
        
        try:
            channel = await guild.create_text_channel(
                name=channel_name, 
                category=category_channel, 
                overwrites=overwrites,
                topic=f"User: {user.name} ({user.id}) | details: {details[:50]}..."
            )
            
            # DB Entry
            await Ticket.create(
                guild_id=str(guild.id),
                channel_id=str(channel.id),
                creator_id=str(user.id),
                category=category,
                ticket_number=next_num,
                details=details,
                status="OPEN"
            )

            # Send ping as plain text (NOT in embed)
            await channel.send(f"{user.mention}")
            
            # Send Control Panel in Ticket (V2 Layout)
            logo_url, _ = await _resolve_brand_assets(interaction.client)
            view = TicketControlView(
                category=category,
                details=details,
                ticket_num=next_num,
                user=user,
                claimed_by=None,
                logo_url=logo_url,
            )
            await channel.send(view=view)
            
            await interaction.followup.send(f"{Emojis.SUCCESS} Ticket created: {channel.mention}", ephemeral=True)
            
        except Exception as e:
            await interaction.followup.send(f"{Emojis.ERROR} Failed to create ticket: {e}", ephemeral=True)



    @staticmethod
    async def close_ticket(channel: discord.TextChannel, closer: discord.Member):
        ticket = await Ticket.filter(channel_id=str(channel.id)).first()
        if ticket:
            ticket.status = "CLOSED"
            await ticket.save()
        
        # Generate transcript before closing
        await channel.send(embed=EmbedUtils.info("📝 Generating Transcript", "Please wait while the transcript is being generated..."))
        
        try:
            transcript_data = await generate_transcript(channel)
            transcript_html = transcript_data["html"]
            stats_msgs = transcript_data["total_messages"]
            stats_participants = transcript_data["participants"]
            
            # Helper to create file object (for sending to log/dm immediately if needed)
            import io
            
            # Fetch config for log channel
            config = await GuildConfig.filter(id=str(channel.guild.id)).first()
            log_channel = None
            if config:
                # User requested separate channels:
                # log_channel_id -> Transcripts (per setup)
                # cmd_log_channel_id -> Command logs
                if config.log_channel_id:
                     log_channel = channel.guild.get_channel(int(config.log_channel_id))
            
            # ------------------------------------------------------------------
            # CREATE TICKET CLOSED EMBED (LOG CHANNEL)
            # ------------------------------------------------------------------
            # ------------------------------------------------------------------
            # UPLOAD TRANSCRIPT TO GET URL
            # ------------------------------------------------------------------
            transcript_url = None
            if log_channel:
                # We send to log channel first to get the URL
                embed_log = discord.Embed(
                    title="Ticket Closed",
                    color=Colors.ERROR
                )
                embed_log.add_field(name="Ticket ID", value=f"`{ticket.ticket_number if ticket else 'N/A'}`", inline=True)
                embed_log.add_field(name="Opened By", value=f"<@{ticket.creator_id}>" if ticket else "Unknown", inline=True)
                embed_log.add_field(name="Closed By", value=closer.mention, inline=True)
                
                f_log = discord.File(
                     io.BytesIO(transcript_html.encode('utf-8')),
                     filename=f"transcript-{channel.name}.html"
                )
                
                # Send to log channel
                log_msg = await log_channel.send(embed=embed_log, file=f_log)
                
                # Get attachment URL
                if log_msg.attachments:
                    transcript_url = log_msg.attachments[0].url
                    
                    # Add Link Button to the Log Message
                    try:
                        view = discord.ui.View()
                        view.add_item(discord.ui.Button(label="View Transcript", style=discord.ButtonStyle.link, url=transcript_url))
                        await log_msg.edit(view=view)
                    except:
                        pass
            
            # ------------------------------------------------------------------
            # SEND DM TO USER (V2 Components)
            # ------------------------------------------------------------------
            if ticket:
                try:
                    creator = await channel.guild.fetch_member(int(ticket.creator_id))
                    if creator:
                        # Build Participant String
                        sorted_participants = sorted(stats_participants.items(), key=lambda item: item[1], reverse=True)
                        participants_str = ""
                        for uid, count in sorted_participants:
                            uid_str = f"<@{uid}>"
                            # Try to resolve name if possible
                            user_obj = channel.guild.get_member(int(uid))
                            if user_obj:
                                uid_str = f"{user_obj.mention} ({user_obj.name})"
                                
                            participants_str += f"{uid_str} — **{count} msg**\n"
                        if not participants_str: participants_str = "None"

                        # Build Details String
                        claimed_text = f"<@{ticket.claimed_by}>"
                        if ticket.claimed_by:
                            c_user = channel.guild.get_member(int(ticket.claimed_by))
                            if c_user: claimed_text = f"{c_user.mention} ({c_user.name})"
                        else:
                            claimed_text = "Unclaimed"

                        # V2 Container Construction
                        container = ContainerBuilder()
                        container.setAccentColor(0x2f3136) # Dark theme
                        
                        # Thumbnail
                        if channel.guild.icon:
                            container.addAccessoryComponents(
                                ThumbnailBuilder().setMediaUrl(channel.guild.icon.url)
                            )
                        
                        # Title
                        container.addTextDisplayComponents(
                            TextDisplayBuilder().setContent(
                                "**Ticket Closed**\n\n"
                                "Thank you for opening a support ticket. We appreciate you reaching out to us. "
                                "If you need any further assistance or have additional questions, please don't "
                                "hesitate to open another ticket and we'll be happy to help."
                            )
                        )
                        
                        # Separator
                        container.addSeparatorComponents(
                            SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(True)
                        )
                        
                        # Ticket Details Header
                        container.addTextDisplayComponents(
                            TextDisplayBuilder().setContent("**Ticket Details**")
                        )
                        
                        details_text = (
                            f"**Category:** {ticket.category if ticket.category else 'Support'}\n"
                            f"**Close Reason:** Done\n"
                            f"**Closed by:** {closer.mention} ({closer.name})\n"
                            f"**Claimed by:** {claimed_text}\n"
                            f"**Total Messages:** {stats_msgs}"
                        )
                        container.addTextDisplayComponents(
                            TextDisplayBuilder().setContent(details_text)
                        )
                        
                        # Separator
                        container.addSeparatorComponents(
                            SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(True)
                        )
                        
                        # Participants
                        container.addTextDisplayComponents(
                            TextDisplayBuilder().setContent(f"**Participants**\n{participants_str[:1000]}")
                        )
                        
                        if transcript_url:
                            container.addActionRowComponents(
                                ActionRowBuilder().addComponents(
                                    ButtonBuilder()
                                    .setStyle(ButtonStyle.Link)
                                    .setLabel("Download Transcript")
                                    .setEmoji("📥")
                                    .setUrl(transcript_url)
                                )
                            )

                        # Send V2 summary card
                        view = discord.ui.LayoutView()
                        view.add_item(container.build())
                        await creator.send(view=view)

                        # Send transcript file separately and attach a download button.
                        try:
                            f_dm = discord.File(
                                 io.BytesIO(transcript_html.encode('utf-8')),
                                 filename=f"transcript-{channel.name}.html"
                            )
                            transcript_msg = await creator.send(file=f_dm)
                            if transcript_msg.attachments:
                                dm_url = transcript_msg.attachments[0].url
                                button_view = discord.ui.View(timeout=None)
                                button_view.add_item(
                                    discord.ui.Button(
                                        label="Download Transcript",
                                        style=discord.ButtonStyle.link,
                                        url=dm_url,
                                        emoji="📥",
                                    )
                                )
                                await transcript_msg.edit(view=button_view)
                            elif transcript_url:
                                button_view = discord.ui.View(timeout=None)
                                button_view.add_item(
                                    discord.ui.Button(
                                        label="Download Transcript",
                                        style=discord.ButtonStyle.link,
                                        url=transcript_url,
                                        emoji="📥",
                                    )
                                )
                                await creator.send(view=button_view)
                        except Exception as e_dm_file:
                            logger.error(f"Failed to send transcript file: {e_dm_file}")
                            if transcript_url:
                                button_view = discord.ui.View(timeout=None)
                                button_view.add_item(
                                    discord.ui.Button(
                                        label="Download Transcript",
                                        style=discord.ButtonStyle.link,
                                        url=transcript_url,
                                        emoji="📥",
                                    )
                                )
                                await creator.send(view=button_view)

                except Exception as e_dm:
                    logger.error(f"Failed to DM user: {e_dm}")

        except Exception as e:
            await channel.send(embed=EmbedUtils.warning("Transcript Error", f"Failed: {e}"))
            logger.error(f"Transcript error: {e}")
        
        await channel.send(embed=EmbedUtils.warning("Closing", "Ticket closing in 5 seconds..."))
        await asyncio.sleep(5)
        await channel.delete()

    @staticmethod
    async def claim_ticket(interaction: discord.Interaction):
        ticket = await Ticket.filter(channel_id=str(interaction.channel.id)).first()
        if not ticket:
             return await interaction.response.send_message("Not a ticket channel.", ephemeral=True)
        
        if ticket.claimed_by:
             return await interaction.response.send_message(f"Already claimed by <@{ticket.claimed_by}>", ephemeral=True)
              
        ticket.claimed_by = str(interaction.user.id)
        await ticket.save()
        
        # Update control panel - Update existing message
        logo_url, _ = await _resolve_brand_assets(interaction.client)
        new_view = TicketControlView(
            category=ticket.category,
            details=ticket.details or "",
            ticket_num=ticket.ticket_number,
            user=interaction.guild.get_member(int(ticket.creator_id)) or interaction.user,
            claimed_by=interaction.user,
            logo_url=logo_url,
        )

        if interaction.message is not None:
            await interaction.response.edit_message(view=new_view)
            await interaction.followup.send(
                embed=EmbedUtils.success("Claimed", f"{interaction.user.mention} has claimed this ticket."),
                ephemeral=True,
            )
        else:
            try:
                async for msg in interaction.channel.history(limit=20, oldest_first=True):
                    if msg.author.bot and msg.components:
                        await msg.edit(view=new_view)
                        break
            except Exception:
                pass
            await interaction.response.send_message(
                embed=EmbedUtils.success("Claimed", f"{interaction.user.mention} has claimed this ticket."),
                ephemeral=True,
            )
        # Keep the original ticket name when claimed.

    @app_commands.command(name="close", description="Close the current ticket")
    async def close_ticket_cmd(self, interaction: discord.Interaction):

        ticket = await Ticket.filter(channel_id=str(interaction.channel.id), status="OPEN").first()
        
        if not ticket:
            return await interaction.response.send_message(
                embed=EmbedUtils.error("Error", "This is not a ticket channel."),
                ephemeral=True
            )
        
        await interaction.response.send_message(
            embed=EmbedUtils.info("Closing", "Starting ticket close process...")
        )
        await Tickets.close_ticket(interaction.channel, interaction.user)

    @app_commands.command(name="block", description="Block a user from speaking in this ticket")
    @app_commands.describe(user="The user to block in this ticket", reason="Reason for blocking")
    @app_commands.default_permissions(manage_channels=True)
    async def block_ticket_cmd(
        self,
        interaction: discord.Interaction,
        user: Optional[discord.Member] = None,
        reason: Optional[str] = "No reason provided",
    ):
        await interaction.response.defer(ephemeral=True)

        channel = interaction.channel
        if not isinstance(channel, discord.TextChannel):
            return await interaction.followup.send(
                embed=EmbedUtils.error("Error", "This command can only be used in ticket channels."),
                ephemeral=True,
            )

        ticket = await Ticket.filter(channel_id=str(channel.id)).first()
        if not ticket:
            return await interaction.followup.send(
                embed=EmbedUtils.error("Error", "This is not a ticket channel."),
                ephemeral=True,
            )

        if interaction.guild is None:
            return await interaction.followup.send("Guild not found.", ephemeral=True)

        target = user
        if target is None:
            target = await Tickets._resolve_ticket_member(interaction.guild, int(ticket.creator_id))
        if not target:
            return await interaction.followup.send("Ticket user not found.", ephemeral=True)

        if Tickets._is_ticket_member_blocked(channel, target):
            return await interaction.followup.send(
                embed=EmbedUtils.error("Already Blocked", f"{target.mention} is already blocked in this ticket."),
                ephemeral=True,
            )

        await Tickets._set_ticket_member_blocked(channel, target, blocked=True)

        reason_text = reason or "No reason provided"
        embed = Tickets._build_ticket_blocked_embed(interaction.user, reason_text)
        view = TicketBlockView(channel.id, target.id)
        await channel.send(embed=embed, view=view)

        await interaction.followup.send(
            embed=EmbedUtils.success("Blocked", f"{target.mention} can no longer send messages in this ticket."),
            ephemeral=True,
        )

    @app_commands.command(name="unblock", description="Unblock a user in this ticket")
    @app_commands.describe(user="The user to unblock in this ticket")
    @app_commands.default_permissions(manage_channels=True)
    async def unblock_ticket_cmd(
        self,
        interaction: discord.Interaction,
        user: Optional[discord.Member] = None,
    ):
        await interaction.response.defer(ephemeral=True)

        channel = interaction.channel
        if not isinstance(channel, discord.TextChannel):
            return await interaction.followup.send(
                embed=EmbedUtils.error("Error", "This command can only be used in ticket channels."),
                ephemeral=True,
            )

        ticket = await Ticket.filter(channel_id=str(channel.id)).first()
        if not ticket:
            return await interaction.followup.send(
                embed=EmbedUtils.error("Error", "This is not a ticket channel."),
                ephemeral=True,
            )

        if interaction.guild is None:
            return await interaction.followup.send("Guild not found.", ephemeral=True)

        target = user
        if target is None:
            target = await Tickets._resolve_ticket_member(interaction.guild, int(ticket.creator_id))
        if not target:
            return await interaction.followup.send("Ticket user not found.", ephemeral=True)

        if not Tickets._is_ticket_member_blocked(channel, target):
            return await interaction.followup.send(
                embed=EmbedUtils.error("Not Blocked", f"{target.mention} is not blocked in this ticket."),
                ephemeral=True,
            )

        await Tickets._set_ticket_member_blocked(channel, target, blocked=False)
        await channel.send(embed=Tickets._build_ticket_unblocked_embed(interaction.user))

        await interaction.followup.send(
            embed=EmbedUtils.success("Unblocked", f"{target.mention} can speak in this ticket again."),
            ephemeral=True,
        )

    @app_commands.command(name="my-tickets", description="View your ticket history")
    async def my_tickets(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        tickets = await Ticket.filter(
            guild_id=str(interaction.guild_id),
            creator_id=str(interaction.user.id)
        ).order_by('-created_at').limit(10)
        
        if not tickets:
            return await interaction.followup.send(
                embed=EmbedUtils.info("No Tickets", "You haven't created any tickets yet.")
            )
        
        embed = discord.Embed(
            title="🎫 Your Tickets",
            color=Colors.INFO
        )
        
        for t in tickets:
            status_emoji = "🟢" if t.status == "OPEN" else "🔴"
            embed.add_field(
                name=f"{status_emoji} #{t.ticket_number:04d} - {t.category.capitalize()}",
                value=f"Status: **{t.status}**\nCreated: {t.created_at.strftime('%Y-%m-%d')}",
                inline=False
            )
        
        await interaction.followup.send(embed=embed)

    @app_commands.command(name="tickets-status", description="View ticket statistics for the server")
    @app_commands.default_permissions(manage_channels=True)
    async def tickets_status(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        open_count = await Ticket.filter(guild_id=str(interaction.guild_id), status="OPEN").count()
        closed_count = await Ticket.filter(guild_id=str(interaction.guild_id), status="CLOSED").count()
        total = open_count + closed_count
        
        # Get category breakdown
        categories = {}
        all_tickets = await Ticket.filter(guild_id=str(interaction.guild_id))
        for t in all_tickets:
            cat = t.category or "general"
            categories[cat] = categories.get(cat, 0) + 1
        
        embed = discord.Embed(
            title="📊 Ticket Statistics",
            color=Colors.PRIMARY
        )
        embed.add_field(name="🟢 Open", value=str(open_count), inline=True)
        embed.add_field(name="🔴 Closed", value=str(closed_count), inline=True)
        embed.add_field(name="📈 Total", value=str(total), inline=True)
        
        if categories:
            cat_text = "\n".join([f"• **{cat.capitalize()}**: {count}" for cat, count in categories.items()])
            embed.add_field(name="📂 By Category", value=cat_text, inline=False)
        
        await interaction.followup.send(embed=embed)

    @app_commands.command(name="transcript", description="Generate a transcript of the current ticket channel")
    @app_commands.default_permissions(manage_channels=True)
    async def transcript(self, interaction: discord.Interaction):

        await interaction.response.defer(ephemeral=True)
        
        # Check if this is a ticket channel
        ticket = await Ticket.filter(channel_id=str(interaction.channel.id)).first()
        if not ticket:
            return await interaction.followup.send(
                embed=EmbedUtils.error("Error", "This command can only be used in ticket channels."),
                ephemeral=True
            )
        
        try:
            import io
            
            # Generate transcript
            transcript_data = await generate_transcript(interaction.channel)
            transcript_html = transcript_data["html"]
            total_messages = transcript_data["total_messages"]
            
            # Create file
            transcript_file = discord.File(
                io.BytesIO(transcript_html.encode('utf-8')),
                filename=f"transcript-{interaction.channel.name}.html"
            )
            
            # Create summary embed
            summary_embed = discord.Embed(
                title="📋 Ticket Transcript",
                description=f"**Channel:** #{interaction.channel.name}\n**Generated by:** {interaction.user.mention}\n**Ticket ID:** {ticket.ticket_number}\n**Messages:** {total_messages}",
                color=Colors.SUCCESS
            )
            summary_embed.set_footer(text=f"Generated at {discord.utils.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC")
            
            await interaction.followup.send(embed=summary_embed, file=transcript_file, ephemeral=True)
            
        except Exception as e:
            await interaction.followup.send(
                embed=EmbedUtils.error("Error", f"Failed to generate transcript: {str(e)[:200]}"),
                ephemeral=True
            )
    @app_commands.command(name="rename", description="Rename the ticket status")
    @app_commands.choices(status=[
        app_commands.Choice(name="⛔ Original", value="original"),
        app_commands.Choice(name="😡 Replace Pending", value="replace-pending"),
        app_commands.Choice(name="✅ Replace Done", value="replace-done"),
        app_commands.Choice(name="🟣 Waiting Owner", value="waiting-owner"),
        app_commands.Choice(name="✅ Done Paid", value="done-paid"),
        app_commands.Choice(name="💸 Waiting Payment", value="waiting-payment"),
        app_commands.Choice(name="❗ Waiting Proofs", value="waiting-proofs"),
        app_commands.Choice(name="📦 Waiting Restock", value="waiting-restock"),
        app_commands.Choice(name="💬 Waiting Reply", value="waiting-reply")
    ])
    @app_commands.default_permissions(manage_messages=True)
    async def rename_ticket(self, interaction: discord.Interaction, status: app_commands.Choice[str]):
        ticket = await Ticket.filter(channel_id=str(interaction.channel.id)).first()
        if not ticket:
            return await interaction.response.send_message(
                embed=EmbedUtils.error("Error", "This is not a ticket channel."),
                ephemeral=True
            )
            
        # Rename channel
        # Format: emoji-status-number (e.g. 💸-waiting-payment-0001)
        status_prefixes = {
            "replace-pending": "😡",
            "replace-done": "✅",
            "waiting-owner": "🟣",
            "done-paid": "✅",
            "waiting-payment": "💸",
            "waiting-proofs": "❗",
            "waiting-restock": "📦",
            "waiting-reply": "💬",
        }

        if status.value == "original":
            if interaction.guild is None:
                return await interaction.response.send_message("Guild not found.", ephemeral=True)
            member = await Tickets._resolve_ticket_member(interaction.guild, int(ticket.creator_id))
            if not member:
                return await interaction.response.send_message("Ticket user not found.", ephemeral=True)
            new_name = Tickets._build_ticket_channel_name(ticket.category or "support", member)
        else:
            prefix = status_prefixes.get(status.value)
            base_name = f"{prefix} • {status.value}" if prefix else status.value
            new_name = f"{base_name}-{ticket.ticket_number:04d}"
            new_name = new_name[:100]
        
        try:
            await interaction.channel.edit(name=new_name)
            arrow_emoji = None
            if interaction.guild:
                arrow_emoji = Tickets._get_guild_emoji(interaction.guild, "arrow")
            arrow = str(arrow_emoji) if arrow_emoji else "➜"

            embed = discord.Embed(
                title="Ticket Renamed",
                description=f"{arrow} This ticket channel has been renamed\n{arrow} Name: `{new_name}`",
                color=Colors.SUCCESS,
            )
            await interaction.response.send_message(embed=embed)
        except Exception as e:
            await interaction.response.send_message(
                embed=EmbedUtils.error("Error", f"Failed to rename channel: {e}"),
                ephemeral=True
            )

async def setup(bot):
    await bot.add_cog(Tickets(bot))
