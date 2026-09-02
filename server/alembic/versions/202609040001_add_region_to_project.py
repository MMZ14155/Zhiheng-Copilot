"""add region to project

Revision ID: 202609040001
Revises: 202609030001
Create Date: 2026-09-02 14:41:40.936426
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '202609040001'
down_revision: str | Sequence[str] | None = '202609030001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("project", sa.Column("region", sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column("project", "region")
