import type { ReactNode } from "react";

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
};

export function PageHeader({ title, subtitle, trailing }: PageHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h1 className="text-lg font-medium text-text">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {trailing ? (
        <div className="flex shrink-0 items-center gap-2">{trailing}</div>
      ) : null}
    </header>
  );
}
