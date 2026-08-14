from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class InvoiceInfo(Base):
    __tablename__ = "invoice_info"
    __table_args__ = (
        Index("ix_invoice_info_invoice_no", "invoice_no"),
        Index("ix_invoice_info_issued_date", "issued_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[str] = mapped_column(
        ForeignKey("file_version.version", ondelete="CASCADE"), nullable=False, unique=True
    )
    invoice_no: Mapped[str | None] = mapped_column(String(120))
    issued_date: Mapped[date | None] = mapped_column(Date)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    tax_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    tax_rate: Mapped[Decimal | None] = mapped_column(Numeric(8, 4))
    buyer: Mapped[str | None] = mapped_column(String(255))
    seller: Mapped[str | None] = mapped_column(String(255))
    missing_fields: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    raw_output: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
