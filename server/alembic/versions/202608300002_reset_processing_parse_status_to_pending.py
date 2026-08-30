"""reset processing parse_status to pending

Revision ID: 202608300002
Revises: 202608300001
Create Date: 2026-08-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "202608300002"
down_revision: Union[str, None] = "202608300001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE file_version SET parse_status = 'pending' "
        "WHERE parse_status IN ('pending', 'processing')"
    )


def downgrade() -> None:
    pass
