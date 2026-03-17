from tortoise import Tortoise, fields, run_async
from tortoise.models import Model
import os
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

class GuildConfig(Model):
    id = fields.CharField(pk=True, max_length=20)
    setup_completed = fields.BooleanField(default=False)
    panel_channel_id = fields.CharField(max_length=20, null=True)
    panel_message_id = fields.CharField(max_length=20, null=True)
    staff_role_id = fields.CharField(max_length=20, null=True)
    ticket_category_id = fields.CharField(max_length=20, null=True)
    log_channel_id = fields.CharField(max_length=20, null=True)
    cmd_log_channel_id = fields.CharField(max_length=20, null=True)
    welcome_channel_id = fields.CharField(max_length=20, null=True)
    
    class Meta:
        table = "guild_configs"

class Ticket(Model):
    id = fields.IntField(pk=True)
    guild_id = fields.CharField(max_length=20)
    channel_id = fields.CharField(max_length=20)
    creator_id = fields.CharField(max_length=20)
    ticket_number = fields.IntField(default=0)
    category = fields.CharField(max_length=50, default="general")
    status = fields.CharField(max_length=20, default="OPEN") # OPEN, CLOSED
    claimed_by = fields.CharField(max_length=20, null=True)
    details = fields.TextField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    
    class Meta:
        table = "tickets"

class Sanction(Model):
    """Stores user sanctions (warns, mutes, bans, etc.)"""
    id = fields.IntField(pk=True)
    guild_id = fields.CharField(max_length=20)
    user_id = fields.CharField(max_length=20)
    moderator_id = fields.CharField(max_length=20)
    type = fields.CharField(max_length=20)  # warn, mute, ban, kick
    reason = fields.TextField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    
    class Meta:
        table = "sanctions"

class UserStats(Model):
    """Stores user XP, level, and daily rewards"""
    id = fields.IntField(pk=True)
    guild_id = fields.CharField(max_length=20)
    user_id = fields.CharField(max_length=20)
    xp = fields.IntField(default=0)
    level = fields.IntField(default=1)
    messages = fields.IntField(default=0)
    last_daily = fields.DatetimeField(null=True)
    
    class Meta:
        table = "user_stats"

class StaffMember(Model):
    """Stores staff team members"""
    id = fields.IntField(pk=True)
    guild_id = fields.CharField(max_length=20)
    user_id = fields.CharField(max_length=20)
    role = fields.CharField(max_length=50)  # e.g., "Support", "Moderator", etc.
    joined_at = fields.DatetimeField(auto_now_add=True)
    payment_method = fields.CharField(max_length=100, null=True)
    is_banned = fields.BooleanField(default=False)
    
    class Meta:
        table = "staff_members"

class BlockedUser(Model):
    """Stores users blocked from creating tickets"""
    id = fields.IntField(pk=True)
    guild_id = fields.CharField(max_length=20)
    user_id = fields.CharField(max_length=20)
    blocked_by = fields.CharField(max_length=20)
    reason = fields.TextField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    
    class Meta:
        table = "blocked_users"

async def init_db():
    db_url = (
        os.getenv("DATABASE_URL")
        or os.getenv("SUPABASE_DATABASE_URL")
        or "sqlite://db.sqlite3"
    )

    # Supabase commonly provides postgresql:// URLs; Tortoise expects postgres://.
    if db_url.startswith("postgresql://"):
        db_url = "postgres://" + db_url[len("postgresql://") :]

    # Normalize PostgreSQL TLS options for asyncpg/Tortoise:
    # - asyncpg accepts `ssl`, not `sslmode`.
    # - Supabase requires TLS.
    if db_url.startswith("postgres://"):
        parsed = urlparse(db_url)
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))

        sslmode = str(query.get("sslmode", "")).strip().lower()
        if sslmode:
            query.pop("sslmode", None)
            if sslmode in {"require", "verify-ca", "verify-full"}:
                query["ssl"] = "true"
            elif sslmode in {"disable", "allow", "prefer"} and "ssl" not in query:
                query["ssl"] = "false"

        if "supabase.co" in (parsed.hostname or "") and "ssl" not in query:
            query["ssl"] = "true"

        parsed = parsed._replace(query=urlencode(query))
        db_url = urlunparse(parsed)
                if os.getenv("DB_SSL_VERIFY", "true").lower() == "false":
            db_url = db_url.replace("ssl=true", "ssl=false")

    await Tortoise.init(
        db_url=db_url,
        modules={'models': ['src.services.database']}
    )
    await Tortoise.generate_schemas()

