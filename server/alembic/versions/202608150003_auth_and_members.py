"""add authentication and project membership"""
import base64, hashlib, os, secrets
import sqlalchemy as sa
from alembic import op
revision = "202608150003"; down_revision = "202608150002"; branch_labels = None; depends_on = None
def _hash(password: str) -> str:
    salt = secrets.token_bytes(16); value = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return "scrypt$16384$8$1$%s$%s" % (base64.urlsafe_b64encode(salt).decode(), base64.urlsafe_b64encode(value).decode())
def upgrade() -> None:
    op.create_table("user_account", sa.Column("id", sa.BigInteger(), primary_key=True), sa.Column("login", sa.String(80), nullable=False), sa.Column("name", sa.String(120), nullable=False), sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column("password_hash", sa.String(255), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()), sa.UniqueConstraint("login", name="uq_user_account_login"))
    op.create_index("ix_user_account_login", "user_account", ["login"], unique=True)
    op.create_table("project_member", sa.Column("id", sa.BigInteger(), primary_key=True), sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("project.id", ondelete="CASCADE"), nullable=False), sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("user_account.id", ondelete="CASCADE"), nullable=False), sa.Column("role", sa.String(20), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()), sa.CheckConstraint("role IN ('manager', 'implementer')", name="ck_project_member_role"), sa.UniqueConstraint("project_id", "user_id", name="uq_project_member_project_user"))
    op.create_index("ix_project_member_project_id", "project_member", ["project_id"]); op.create_index("ix_project_member_user_id", "project_member", ["user_id"])
    op.create_table("auth_token", sa.Column("id", sa.BigInteger(), primary_key=True), sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("user_account.id", ondelete="CASCADE"), nullable=False), sa.Column("token_hash", sa.String(64), nullable=False), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()), sa.UniqueConstraint("token_hash", name="uq_auth_token_hash"))
    op.create_index("ix_auth_token_user_id", "auth_token", ["user_id"]); op.create_index("ix_auth_token_token_hash", "auth_token", ["token_hash"], unique=True); op.create_index("ix_auth_token_expires_at", "auth_token", ["expires_at"])
    users = sa.table("user_account", sa.column("login", sa.String()), sa.column("name", sa.String()), sa.column("is_admin", sa.Boolean()), sa.column("password_hash", sa.String()))
    op.bulk_insert(users, [{"login":"admin","name":"系统管理员","is_admin":True,"password_hash":_hash(os.getenv("SEED_ADMIN_PASSWORD","admin-dev-only"))},{"login":"demo","name":"演示用户","is_admin":False,"password_hash":_hash(os.getenv("SEED_DEMO_PASSWORD","demo-dev-only"))}])
def downgrade() -> None:
    op.drop_table("auth_token"); op.drop_table("project_member"); op.drop_table("user_account")
