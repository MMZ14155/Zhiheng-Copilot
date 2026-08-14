"""add invoice and payment extraction tables

Revision ID: 202608140001
Revises: 202608130001
Create Date: 2026-08-14 18:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "202608140001"
down_revision: str | Sequence[str] | None = "202608130001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "invoice_info",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("version", sa.String(length=64), nullable=False, unique=True),
        sa.Column("invoice_no", sa.String(length=120)),
        sa.Column("issued_date", sa.Date()),
        sa.Column("amount", sa.Numeric(18, 2)),
        sa.Column("tax_amount", sa.Numeric(18, 2)),
        sa.Column("tax_rate", sa.Numeric(8, 4)),
        sa.Column("buyer", sa.String(length=255)),
        sa.Column("seller", sa.String(length=255)),
        sa.Column("missing_fields", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("raw_output", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["version"], ["file_version.version"], ondelete="CASCADE"),
    )
    op.create_index("ix_invoice_info_invoice_no", "invoice_info", ["invoice_no"])
    op.create_index("ix_invoice_info_issued_date", "invoice_info", ["issued_date"])
    op.create_table(
        "payment_info",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("version", sa.String(length=64), nullable=False, unique=True),
        sa.Column("amount", sa.Numeric(18, 2)),
        sa.Column("payment_date", sa.Date()),
        sa.Column("payer", sa.String(length=255)),
        sa.Column("contract_no", sa.String(length=120)),
        sa.Column("remarks", sa.Text()),
        sa.Column("missing_fields", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("raw_output", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["version"], ["file_version.version"], ondelete="CASCADE"),
    )
    op.create_index("ix_payment_info_payment_date", "payment_info", ["payment_date"])
    op.create_index("ix_payment_info_contract_no", "payment_info", ["contract_no"])


def downgrade() -> None:
    op.drop_table("payment_info")
    op.drop_table("invoice_info")
