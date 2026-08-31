"""add file_version extract_path and multimodal_required status

Revision ID: 202609010001
Revises: 202608310001
Create Date: 2026-09-01 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "202609010001"
down_revision: Union[str, None] = "202608310001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column(
        "file_version",
        sa.Column("extract_path", sa.String(1024), nullable=True),
    )
    op.drop_constraint("ck_file_version_parse_status", "file_version", type_="check")
    op.create_check_constraint(
        "ck_file_version_parse_status",
        "file_version",
        sa.text(
            "parse_status IN ('pending', 'processing', 'parsed', 'failed', 'skipped', 'multimodal_required')"
        ),
    )


def downgrade() -> None:
    op.drop_constraint("ck_file_version_parse_status", "file_version", type_="check")
    op.create_check_constraint(
        "ck_file_version_parse_status",
        "file_version",
        sa.text("parse_status IN ('pending', 'processing', 'parsed', 'failed', 'skipped')"),
    )
    op.drop_column("file_version", "extract_path")
