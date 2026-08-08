import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  titleClassName?: string;
  descriptionClassName?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  titleClassName = 'page-title',
  descriptionClassName = 'page-description',
}: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header__copy">
        <h1 className={titleClassName}>{title}</h1>
        {description && <p className={descriptionClassName}>{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
