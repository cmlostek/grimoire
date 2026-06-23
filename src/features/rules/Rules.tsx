import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import EditionToggle from '../../components/EditionToggle';
import { RULE_SECTIONS, ruleSectionsFor } from '../../data/srd';
import type { RuleSection } from '../../data/types';
import { CONDITIONS } from '../../data/conditions';
import { Search } from 'lucide-react';
import { useCampaignSettings } from '../notes/campaignSettingsStore';

type Mode = 'rules' | 'conditions';

/** Categories the rules glossary splits into for the sidebar filter.
 *  Derived from the `[Tag]` suffixes on the source's rule names, plus a
 *  length-based heuristic for untagged entries. */
type RuleCategory = 'all' | 'rule' | 'definition' | 'action' | 'condition' | 'hazard' | 'attitude';

/** Strip the trailing `[Tag]` from a rule name for display. */
function stripTag(name: string): string {
  return name.replace(/\s*\[\w+\]\s*$/, '').trim();
}

/** Bucket a rule entry. Bracketed tags drive most of this; untagged entries
 *  split into a substantive "rule" (has a table, bullet list, or runs long)
 *  vs a "definition" (a sentence or two). */
function categorize(r: RuleSection): Exclude<RuleCategory, 'all'> {
  const m = r.name.match(/\[(\w+)\]\s*$/);
  const tag = m?.[1]?.toLowerCase();
  if (tag === 'action') return 'action';
  if (tag === 'condition') return 'condition';
  if (tag === 'hazard') return 'hazard';
  if (tag === 'attitude') return 'attitude';
  // Untagged heuristic:
  if (/^\s*\|/m.test(r.desc) || /\|\s*---/.test(r.desc)) return 'rule'; // markdown table
  if (/^\s*[-*]\s/m.test(r.desc)) return 'rule';                          // bullet list
  if (r.desc.length > 400) return 'rule';
  return 'definition';
}

const CATEGORY_LABEL: Record<RuleCategory, string> = {
  all: 'All',
  rule: 'Rules',
  definition: 'Definitions',
  action: 'Actions',
  condition: 'Conditions',
  hazard: 'Hazards',
  attitude: 'Attitudes',
};

/** Replace `"Foo"` mentions in a rule description with markdown links to
 *  the matching rule slug when one exists. Lets the player click through
 *  "See also" references without scrolling for them in the sidebar. */
function linkifySeeAlso(desc: string, nameToIndex: Map<string, string>): string {
  return desc.replace(/"([^"\n]{2,80})"/g, (_, raw: string) => {
    const target = nameToIndex.get(raw.trim().toLowerCase());
    return target ? `["${raw}"](#${target})` : `"${raw}"`;
  });
}

export default function Rules() {
  const [mode, setMode] = useState<Mode>('rules');
  const [category, setCategory] = useState<RuleCategory>('all');
  const [query, setQuery] = useState('');
  const edition = useCampaignSettings((s) => s.settings.srdEdition);
  const rulePool = useMemo(() => ruleSectionsFor(edition), [edition]);
  const [selectedRule, setSelectedRule] = useState<string | null>(
    rulePool[0]?.index ?? null
  );
  const [selectedCondition, setSelectedCondition] = useState<string | null>(
    CONDITIONS[0]?.index ?? null
  );
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return;
    if (CONDITIONS.some((c) => c.index === hash)) {
      setMode('conditions');
      setSelectedCondition(hash);
      return;
    }
    // Prefer the current edition; fall back to the union so chat chips and
    // wiki links work even when the current filter would hide the target.
    if (rulePool.some((r) => r.index === hash) || RULE_SECTIONS.some((r) => r.index === hash)) {
      setMode('rules');
      setSelectedRule(hash);
    }
  }, [location.hash, rulePool]);

  // Map of display-name (lowercased, tag-stripped) → slug, used by the
  // "See also" linkifier so quoted rule names become click-through links.
  const nameToIndex = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rulePool) m.set(stripTag(r.name).toLowerCase(), r.index);
    for (const c of CONDITIONS) m.set(c.name.toLowerCase(), c.index);
    return m;
  }, [rulePool]);

  // Bucket the rules once so the sidebar category chips can show counts.
  const categorized = useMemo(() => {
    const buckets: Record<Exclude<RuleCategory, 'all'>, RuleSection[]> = {
      rule: [], definition: [], action: [], condition: [], hazard: [], attitude: [],
    };
    for (const r of rulePool) buckets[categorize(r)].push(r);
    return buckets;
  }, [rulePool]);

  let ruleEntries: RuleSection[];
  if (category === 'all') {
    ruleEntries = rulePool;
  } else {
    ruleEntries = categorized[category];
  }
  const entries = mode === 'rules' ? ruleEntries : CONDITIONS;
  const selectedIndex = mode === 'rules' ? selectedRule : selectedCondition;
  const setSelectedIndex = mode === 'rules' ? setSelectedRule : setSelectedCondition;

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const sorted = [...entries].sort((a, b) => stripTag(a.name).localeCompare(stripTag(b.name)));
    if (!q) return sorted;
    return sorted.filter(
      (r) => r.name.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q)
    );
  }, [query, entries]);

  // For rules mode, fall back to union if the selected rule isn't in the current edition pool.
  const selected =
    mode === 'rules'
      ? rulePool.find((r) => r.index === selectedIndex) ??
        RULE_SECTIONS.find((r) => r.index === selectedIndex) ??
        null
      : entries.find((r) => r.index === selectedIndex) ?? null;

  const editionLabel =
    edition === '2014' ? 'SRD 5.1' : edition === '2024' ? 'SRD 5.2' : 'SRD 5.1 + 5.2';

  // Available category chips for the current rule pool, with counts.
  const categoryChips: { value: RuleCategory; count: number }[] = ([
    { value: 'all' as const, count: rulePool.length },
    { value: 'rule' as const, count: categorized.rule.length },
    { value: 'definition' as const, count: categorized.definition.length },
    { value: 'action' as const, count: categorized.action.length },
    { value: 'hazard' as const, count: categorized.hazard.length },
    { value: 'attitude' as const, count: categorized.attitude.length },
    // Conditions tab below already covers the [Condition] tag, but keep
    // the chip for users who want to scan rules-tab-only.
    { value: 'condition' as const, count: categorized.condition.length },
  ] satisfies { value: RuleCategory; count: number }[]).filter((c) => c.count > 0);

  // Intercept in-page hash links coming out of the rendered markdown so the
  // navigation triggers the useEffect above (which moves selection) without
  // a full page reload.
  const handleMarkdownClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#')) {
      e.preventDefault();
      navigate({ pathname: '/rules', hash: href });
    }
  };

  return (
    <div className="h-full flex flex-col">
      <PageHeader title={`Rules (${editionLabel})`}>
        <EditionToggle />
        <div className="text-xs text-slate-500">
          Open-licensed content (CC-BY-4.0).{' '}
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
          {mode === 'rules' && (
            <div className="px-3 pt-2 pb-1 border-b border-slate-800">
              <div className="flex flex-wrap gap-1">
                {categoryChips.map(({ value, count }) => (
                  <button
                    key={value}
                    onClick={() => setCategory(value)}
                    className={`px-2 py-0.5 text-[10px] uppercase tracking-wider rounded border ${
                      category === value
                        ? 'border-sky-600 bg-sky-900/40 text-sky-200'
                        : 'border-slate-800 bg-slate-950 text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                    }`}
                  >
                    {CATEGORY_LABEL[value]} <span className="text-slate-600 font-mono">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
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
                <div className="text-sm">{stripTag(r.name)}</div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="p-4 text-xs text-slate-600 italic">No matches.</div>
            )}
          </div>
        </aside>
        <section className="flex-1 min-w-0 overflow-y-auto">
          {selected ? (
            <div
              className="px-8 py-6 markdown-body max-w-4xl"
              onClick={handleMarkdownClick}
            >
              <h1>{stripTag(selected.name)}</h1>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {mode === 'rules' ? linkifySeeAlso(selected.desc, nameToIndex) : selected.desc}
              </ReactMarkdown>
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
