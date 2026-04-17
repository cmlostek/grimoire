import { ReactNode } from 'react';

export default function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
      <h1 className="font-serif text-2xl text-sky-200">{title}</h1>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
