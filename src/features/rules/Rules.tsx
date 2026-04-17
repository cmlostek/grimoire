import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import PageHeader from '../../components/PageHeader';
import { RULE_SECTIONS } from '../../data/srd';
import { CONDITIONS } from '../../data/conditions';
import { Search } from 'lucide-react';

type Mode = 'rules' | 'conditions';

export default function Rules() {
  const [mode, setMode] = useState<Mode>('rules');
  const [query, setQuery] = useState('');
  const [selectedRule, setSelectedRule] = useState<string | null>(
    RULE_SECTIONS[0]?.index ?? null
  );
  const [selectedCondition, setSelectedCondition] = useState<string | null>(
    CONDITIONS[0]?.index ?? null
  );

  const entries = mode === 'rules' ? RULE_SECTIONS : CONDITIONS;
  const selectedIndex = mode === 'rules' ? selectedRule : selectedCondition;
  const setSelectedIndex = mode === 'rules' ? setSelectedRule : setSelectedCondition;

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    return sorted.filter(
      (r) => r.name.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q)
    );
  }, [query, entries]);

  const selected = entries.find((r) => r.index === selectedIndex) ?? null;

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Rules (SRD 5.1)">
        <div className="text-xs text-slate-500">
          Open-licensed content. Full rules:{' '}
          <a
            className="text-sky-400 hover:underline"
            href="https://dnd.wizards.com/resources/systems-reference-document"
            target="_blank"
            rel="noreferrer"
          >
            WotC SRD
          </a>
        </div>
      </PageHeader>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-72 border-r border-slate-800 flex flex-col">
          <div className="flex border-b border-slate-800">
            <button
              onClick={() => {
                setMode('rules');
                setQuery('');
              }}
              className={`flex-1 px-3 py-2 text-xs uppercase tracking-wider ${
                mode === 'rules'
                  ? 'bg-slate-800 text-sky-300'
                  : 'text-slate-500 hover:bg-slate-900'
              }`}
            >
              Rules
            </button>
            <button
              onClick={() => {
                setMode('conditions');
                setQuery('');
              }}
              className={`flex-1 px-3 py-2 text-xs uppercase tracking-wider ${
                mode === 'conditions'
                  ? 'bg-slate-800 text-sky-300'
                  : 'text-slate-500 hover:bg-slate-900'
              }`}
            >
              Conditions
            </button>
          </div>
          <div className="p-3 border-b border-slate-800">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={mode === 'rules' ? 'Search rules' : 'Search conditions'}
                className="w-full bg-slate-900 border border-slate-800 rounded pl-7 pr-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.map((r) => (
              <button
                key={r.index}
                onClick={() => setSelectedIndex(r.index)}
                className={`w-full text-left px-3 py-2 border-b border-slate-900 ${
                  r.index === selectedIndex ? 'bg-slate-800' : 'hover:bg-slate-900'
                }`}
              >
                <div className="text-sm">{r.name}</div>
              </button>
            ))}
          </div>
        </aside>
        <section className="flex-1 min-w-0 overflow-y-auto">
          {selected ? (
            <div className="px-8 py-6 markdown-body max-w-4xl">
              <h1>{selected.name}</h1>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.desc}</ReactMarkdown>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500">
              {mode === 'rules' ? 'Select a rule section.' : 'Select a condition.'}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
