export default function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-md px-8">
        <div className="font-serif text-3xl text-sky-200 mb-2">{title}</div>
        <div className="text-slate-400 text-sm">{note}</div>
      </div>
    </div>
  );
}
