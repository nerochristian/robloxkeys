from tortoise import Tortoise, fields, run_async
from tortoise.models import Model
import os
import ssl
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode, unquote_plus
from ..utils.logger import logger

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
    supabase_db_url = os.getenv("SUPABASE_DATABASE_URL")
    default_db_url = os.getenv("DATABASE_URL")
    db_url_source = "SUPABASE_DATABASE_URL" if supabase_db_url else ("DATABASE_URL" if default_db_url else "sqlite")
    db_url = supabase_db_url or default_db_url or "sqlite://db.sqlite3"

    # Supabase commonly provides postgresql:// URLs; normalize for parsing.
    if db_url.startswith("postgresql://"):
        db_url = "postgres://" + db_url[len("postgresql://") :]

    if db_url.startswith("postgres://"):
        parsed = urlparse(db_url)
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))

        sslmode = str(query.pop("sslmode", "")).strip().lower()
        explicit_ssl = str(query.pop("ssl", "")).strip().lower()
        host = (parsed.hostname or "").lower()

        wants_ssl = (
            sslmode in {"require", "verify-ca", "verify-full"}
            or explicit_ssl in {"1", "true", "yes", "require", "verify-ca", "verify-full"}
            or host.endswith(".pooler.supabase.com")
            or host.endswith(".supabase.co")
        )

        # Supabase pooler can present cert chains that fail strict validation in some runtimes.
        # Default to no-verify for pooler hosts unless explicitly overridden.
        verify_override = str(os.getenv("DB_SSL_VERIFY", "")).strip().lower()
        if verify_override in {"1", "true", "yes"}:
            verify_ssl = True
        elif verify_override in {"0", "false", "no"}:
            verify_ssl = False
        else:
            verify_ssl = not host.endswith(".pooler.supabase.com")

        logger.info(
            "DB init using %s host=%s ssl_verify=%s",
            db_url_source,
            host or "unknown",
            verify_ssl,
        )

        ssl_arg = None
        if wants_ssl:
            if verify_ssl:
                ssl_arg = ssl.create_default_context()
            else:
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                ssl_arg = ctx

        credentials = {
            "host": parsed.hostname or None,
            "port": parsed.port or 5432,
            "user": unquote_plus(parsed.username or "") or None,
            "password": (
                unquote_plus(parsed.password or "") if parsed.password is not None else None
            ),
            "database": parsed.path[1:] if parsed.path and parsed.path != "/" else None,
        }

        # Forward safe asyncpg pool/query options from URL.
        int_keys = {
            "min_size",
            "max_size",
            "max_queries",
            "timeout",
            "statement_cache_size",
            "max_cached_statement_lifetime",
            "max_cacheable_statement_size",
        }
        float_keys = {"max_inactive_connection_lifetime"}
        for key, raw_value in query.items():
            if key in int_keys:
                try:
                    credentials[key] = int(raw_value)
                except (TypeError, ValueError):
                    continue
            elif key in float_keys:
                try:
                    credentials[key] = float(raw_value)
                except (TypeError, ValueError):
                    continue
            elif key == "application_name":
                # Tortoise maps this to server_settings via `application_name`.
                credentials["application_name"] = str(raw_value)

        if ssl_arg is not None:
            credentials["ssl"] = ssl_arg

        config = {
            "connections": {
                "default": {
                    "engine": "tortoise.backends.asyncpg",
                    "credentials": credentials,
                }
            },
            "apps": {
                "models": {
                    "models": ["src.services.database"],
                    "default_connection": "default",
                }
            },
        }

        try:
            await Tortoise.init(config=config)
        except Exception as exc:
            if "CERTIFICATE_VERIFY_FAILED" not in str(exc):
                raise

            logger.warning("DB certificate verification failed. Retrying with ssl verification disabled.")
            retry_ctx = ssl.create_default_context()
            retry_ctx.check_hostname = False
            retry_ctx.verify_mode = ssl.CERT_NONE
            credentials["ssl"] = retry_ctx
            await Tortoise.init(config=config)
    else:
        await Tortoise.init(
            db_url=db_url,
            modules={'models': ['src.services.database']}
        )
    await Tortoise.generate_schemas()

