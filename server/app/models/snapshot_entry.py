from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class SnapshotEntry(Base):
    __tablename__ = "snapshot_entry"
    snapshot_hash: Mapped[str] = mapped_column(ForeignKey("snapshot.hash", ondelete="RESTRICT"), primary_key=True)
    file_id: Mapped[int] = mapped_column(ForeignKey("workspace_file.id", ondelete="RESTRICT"), primary_key=True)
    version: Mapped[str] = mapped_column(ForeignKey("file_version.version", ondelete="RESTRICT"), nullable=False)
    path: Mapped[str] = mapped_column(String(255), nullable=False)
