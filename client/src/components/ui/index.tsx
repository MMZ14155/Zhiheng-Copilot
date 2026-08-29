import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import "./ui.css";
export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button className={`ui-button ${variant} ${className}`.trim()} {...props} />
  );
}
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`ui-card ${className}`}>{children}</section>;
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "primary" | "success" | "warning" | "danger" | "role";
}) {
  return <span className={`ui-badge ${tone}`}>{children}</span>;
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ui-empty">
      <div className="ui-empty-icon">◇</div>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="ui-skeleton" role="status" aria-label="正在加载">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}
export function Alert({
  children,
  tone = "danger",
  action,
}: {
  children: ReactNode;
  tone?: "danger" | "warning" | "info" | "success";
  action?: ReactNode;
}) {
  return (
    <div
      className={`ui-alert ${tone}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      <span>{children}</span>
      {action}
    </div>
  );
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="ui-input" {...props} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="ui-input" {...props} />;
}
export function Tabs({
  tabs,
  active,
  onChange,
  label = "内容导航",
}: {
  tabs: Array<{ key: string; label: string }>;
  active: string;
  onChange: (key: string) => void;
  label?: string;
}) {
  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          className={active === tab.key ? "active" : ""}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
export function Table({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="ui-table-wrap">
      <table className="ui-table" aria-label={label}>
        {children}
      </table>
    </div>
  );
}
export function Modal({
  title,
  children,
  footer,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div
      className="ui-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`ui-modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ui-modal-title"
      >
        <div className="ui-modal-heading">
          <h3 id="ui-modal-title">{title}</h3>
          <button type="button" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-footer">{footer}</div>}
      </section>
    </div>
  );
}
