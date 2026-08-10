"""ensure one deliverable per source file"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "202608100001"
down_revision: str | Sequence[str] | None = "202607230001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_tracked_file_source",
        "tracked_file",
        ["source_file_id"],
        unique=True,
        postgresql_where=sa.text("source_file_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_tracked_file_source", table_name="tracked_file")
