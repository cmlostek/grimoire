import { useState, type ReactNode } from 'react';

export function Secret({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={`note-secret ${open ? 'note-secret-open' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((o) => !o);
      }}
      title={open ? 'Click to hide' : 'Click to reveal'}
    >
      {children}
    </span>
  );
}
