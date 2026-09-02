"""add delivery_warning_dismissed to project

Revision ID: 202609030001
Revises: 869b3bc05111
Create Date: 2026-09-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "202609030001"
down_revision: Union[str, None] = "869b3bc05111"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "project",
        sa.Column("delivery_warning_dismissed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("project", "delivery_warning_dismissed")
