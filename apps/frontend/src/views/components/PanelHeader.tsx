import type { PropsWithChildren } from "react";

interface PanelHeaderProps {
  subtitle?: string;
}

export const PanelHeader = ({ children, subtitle }: PropsWithChildren<PanelHeaderProps>) => (
  <header className="panel-header">
    <div>
      <h2>{children}</h2>
      {subtitle ? <p className="panel-subtitle">{subtitle}</p> : null}
    </div>
    <div className="panel-indicator" />
  </header>
);
