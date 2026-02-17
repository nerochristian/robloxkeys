
import discord
from discord import app_commands
from discord.ext import commands
from typing import Optional
from ..utils.base_cog import BaseCog
from ..utils.embeds import EmbedUtils
from ..utils.constants import Emojis, Colors
from ..services.database import StaffMember, StaffPayment


class Staff(BaseCog):


    @app_commands.command(name="apply-staff", description="Apply to join the staff team")
    async def apply_staff(self, interaction: discord.Interaction):
        # Create application modal
        modal = StaffApplicationModal()
        await interaction.response.send_modal(modal)

    @app_commands.command(name="give-staff", description="Add a user to the staff team")
    @app_commands.describe(user="The user to add", role="Their staff role")
    @app_commands.choices(role=[
        app_commands.Choice(name="Support", value="support"),
        app_commands.Choice(name="Moderator", value="moderator"),
        app_commands.Choice(name="Admin", value="admin"),
    ])
    @app_commands.default_permissions(administrator=True)
    async def give_staff(self, interaction: discord.Interaction, user: discord.Member, role: str):
        await interaction.response.defer(ephemeral=True)
        
        existing = await StaffMember.filter(
            guild_id=str(interaction.guild_id),
            user_id=str(user.id)
        ).first()
        
        if existing:
            existing.role = role
            await existing.save()
            action = "updated"
        else:
            await StaffMember.create(
                guild_id=str(interaction.guild_id),
                user_id=str(user.id),
                role=role
            )
            action = "added"
        
        await interaction.followup.send(
            embed=EmbedUtils.success("Staff Updated", f"{user.mention} has been {action} as **{role.capitalize()}**.")
        )

    @app_commands.command(name="staff-ban", description="Ban a staff member from the team")
    @app_commands.describe(user="The staff member to ban", reason="Reason for the ban")
    @app_commands.default_permissions(administrator=True)
    async def staff_ban(self, interaction: discord.Interaction, user: discord.Member, reason: Optional[str] = "No reason"):
        await interaction.response.defer(ephemeral=True)
        
        staff = await StaffMember.filter(
            guild_id=str(interaction.guild_id),
            user_id=str(user.id)
        ).first()
        
        if not staff:
            return await interaction.followup.send(
                embed=EmbedUtils.error("Not Found", f"{user.mention} is not a staff member.")
            )
        
        staff.is_banned = True
        await staff.save()
        
        await interaction.followup.send(
            embed=EmbedUtils.success("Staff Banned", f"{user.mention} has been banned from the staff team.\n**Reason:** {reason}")
        )

    @app_commands.command(name="staff-unban", description="Unban a staff member")
    @app_commands.describe(user="The staff member to unban")
    @app_commands.default_permissions(administrator=True)
    async def staff_unban(self, interaction: discord.Interaction, user: discord.Member):
        await interaction.response.defer(ephemeral=True)
        
        staff = await StaffMember.filter(
            guild_id=str(interaction.guild_id),
            user_id=str(user.id)
        ).first()
        
        if not staff:
            return await interaction.followup.send(
                embed=EmbedUtils.error("Not Found", f"{user.mention} is not in the staff database.")
            )
        
        staff.is_banned = False
        await staff.save()
        
        await interaction.followup.send(
            embed=EmbedUtils.success("Staff Unbanned", f"{user.mention} has been unbanned from the staff team.")
        )

    @app_commands.command(name="pay-staff", description="Record a staff payment")
    @app_commands.describe(user="The staff member", amount="Payment amount", method="Payment method")
    @app_commands.default_permissions(administrator=True)
    async def pay_staff(self, interaction: discord.Interaction, user: discord.Member, amount: float, method: str):
        await interaction.response.defer(ephemeral=True)

        staff = await StaffMember.filter(
            guild_id=str(interaction.guild_id),
            user_id=str(user.id)
        ).first()
        if not staff:
            return await interaction.followup.send(
                embed=EmbedUtils.error("Not Staff", f"{user.mention} is not in the staff database.")
            )

        await StaffPayment.create(
            guild_id=str(interaction.guild_id),
            staff_user_id=str(user.id),
            payer_user_id=str(interaction.user.id),
            amount=float(amount),
            method=str(method).strip() or "manual",
        )

        embed = discord.Embed(
            title="Staff Payment Recorded",
            color=Colors.SUCCESS
        )
        embed.add_field(name="Staff Member", value=user.mention, inline=True)
        embed.add_field(name="Amount", value=f"${amount:.2f}", inline=True)
        embed.add_field(name="Method", value=method, inline=True)
        embed.add_field(name="Paid By", value=interaction.user.mention, inline=True)
        embed.timestamp = discord.utils.utcnow()

        await interaction.followup.send(embed=embed)

    @app_commands.command(name="staff-mail", description="Send a DM to staff members")
    @app_commands.describe(message="The message to send", role="Optional: only send to specific staff role")
    @app_commands.default_permissions(administrator=True)
    async def staff_mail(self, interaction: discord.Interaction, message: str, role: Optional[discord.Role] = None):
        await interaction.response.defer(ephemeral=True)
        
        staff_members = await StaffMember.filter(
            guild_id=str(interaction.guild_id),
            is_banned=False
        )
        
        sent = 0
        failed = 0
        
        for staff in staff_members:
            member = interaction.guild.get_member(int(staff.user_id))
            if not member:
                continue
            
            if role and role not in member.roles:
                continue
            
            try:
                embed = discord.Embed(
                    title="📬 Staff Announcement",
                    description=message,
                    color=Colors.INFO
                )
                embed.set_footer(text=f"From: {interaction.user.display_name}")
                await member.send(embed=embed)
                sent += 1
            except:
                failed += 1
        
        await interaction.followup.send(
            embed=EmbedUtils.success("Mail Sent", f"Successfully sent to **{sent}** staff members.\nFailed: **{failed}**")
        )

    @app_commands.command(name="select-payment", description="Set your preferred payment method")
    @app_commands.describe(method="Your payment method (PayPal, CashApp, etc.)")
    async def select_payment(self, interaction: discord.Interaction, method: str):
        await interaction.response.defer(ephemeral=True)
        
        staff = await StaffMember.filter(
            guild_id=str(interaction.guild_id),
            user_id=str(interaction.user.id)
        ).first()
        
        if not staff:
            return await interaction.followup.send(
                embed=EmbedUtils.error("Not Staff", "You are not a registered staff member.")
            )
        
        staff.payment_method = method
        await staff.save()
        
        await interaction.followup.send(
            embed=EmbedUtils.success("Payment Method Set", f"Your payment method has been set to: **{method}**")
        )

    @app_commands.command(name="staff-list", description="View all staff members")
    async def staff_list(self, interaction: discord.Interaction):
        await interaction.response.defer()
        
        staff_members = await StaffMember.filter(
            guild_id=str(interaction.guild_id),
            is_banned=False
        ).order_by('role')
        
        if not staff_members:
            return await interaction.followup.send(embed=EmbedUtils.info("No Staff", "No staff members registered."))
        
        embed = discord.Embed(
            title="👥 Staff Team",
            color=Colors.PRIMARY
        )
        
        staff_by_role = {}
        for s in staff_members:
            if s.role not in staff_by_role:
                staff_by_role[s.role] = []
            staff_by_role[s.role].append(s.user_id)
        
        for role, members in staff_by_role.items():
            member_mentions = [f"<@{uid}>" for uid in members]
            embed.add_field(
                name=f"{role.capitalize()}",
                value=", ".join(member_mentions),
                inline=False
            )
        
        await interaction.followup.send(embed=embed)


class StaffApplicationModal(discord.ui.Modal, title="Staff Application"):
    experience = discord.ui.TextInput(
        label="Previous Experience",
        placeholder="Describe your experience...",
        style=discord.TextStyle.paragraph,
        max_length=500
    )
    
    availability = discord.ui.TextInput(
        label="Availability",
        placeholder="How many hours per week can you dedicate?",
        max_length=100
    )
    
    why = discord.ui.TextInput(
        label="Why do you want to join?",
        placeholder="Tell us why...",
        style=discord.TextStyle.paragraph,
        max_length=500
    )
    
    async def on_submit(self, interaction: discord.Interaction):
        embed = discord.Embed(
            title="📝 New Staff Application",
            color=Colors.INFO
        )
        embed.add_field(name="Applicant", value=interaction.user.mention, inline=False)
        embed.add_field(name="Experience", value=self.experience.value, inline=False)
        embed.add_field(name="Availability", value=self.availability.value, inline=False)
        embed.add_field(name="Motivation", value=self.why.value, inline=False)
        embed.timestamp = discord.utils.utcnow()
        
        # Send to current channel (could be configured)
        await interaction.response.send_message(
            embed=EmbedUtils.success("Application Submitted", "Your application has been received!"),
            ephemeral=True
        )
        
        # Try to send to a staff channel (this would need configuration)
        await interaction.channel.send(embed=embed)


async def setup(bot):
    await bot.add_cog(Staff(bot))
