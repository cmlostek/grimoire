import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Network } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import { useSession } from '../session/sessionStore';
import { useNotes, canViewNote, EMPTY_PERMS, type Note } from './notesStore';

/**
 * Extract `[[Title]]` and `[[Title#Heading]]` references from a note body.
 * Returns the bare titles (heading stripped) so we can resolve them against
 * the canonical note list. Code fences are ignored — `[[example]]` inside
 * a snippet shouldn't draw an edge.
 */
function extractLinkTargets(body: string): string[] {
  if (!body) return [];
  // Strip fenced code blocks so we don't pick up `[[…]]` inside ``` blocks.
  const stripped = body.replace(/```[\s\S]*?```/g, '');
  const out: string[] = [];
  const re = /\[\[([^\]\n]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    const raw = m[1].trim();
    const bare = raw.includes('#') ? raw.slice(0, raw.indexOf('#')) : raw;
    const t = bare.trim();
    if (t) out.push(t);
  }
  return out;
}

type Node = {
  id: string;
  title: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  degree: number;
};

type Edge = { from: string; to: string };

/**
 * Tiny verlet-ish force layout: linear repulsion between every pair, spring
 * pull on each edge, gentle gravity toward the centre. Capped at 240 ticks so
 * the layout settles quickly and the simulation stops eating CPU.
 */
function simulate(
  nodes: Node[],
  edges: Edge[],
  width: number,
  height: number,
  ticks = 240,
) {
  if (nodes.length === 0) return;
  const cx = width / 2;
  const cy = height / 2;
  const REPEL = 6000;
  const SPRING_K = 0.012;
  const SPRING_LEN = 110;
  const GRAVITY = 0.012;
  const DAMP = 0.82;
  const MAX_V = 18;

  for (let t = 0; t < ticks; t++) {
    // Repulsion (O(n^2) — fine while we expect at most a few hundred notes).
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy + 0.01;
        const f = REPEL / distSq;
        const dist = Math.sqrt(distSq);
        const fx = (dx / dist) * f;
        const fy = (dy / dist) * f;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }
    // Springs.
    for (const e of edges) {
      const a = nodes.find((n) => n.id === e.from);
      const b = nodes.find((n) => n.id === e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const stretch = dist - SPRING_LEN;
      const fx = (dx / dist) * stretch * SPRING_K;
      const fy = (dy / dist) * stretch * SPRING_K;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
    // Gravity + integrate.
    for (const n of nodes) {
      n.vx += (cx - n.x) * GRAVITY;
      n.vy += (cy - n.y) * GRAVITY;
      n.vx = Math.max(-MAX_V, Math.min(MAX_V, n.vx * DAMP));
      n.vy = Math.max(-MAX_V, Math.min(MAX_V, n.vy * DAMP));
      n.x += n.vx;
      n.y += n.vy;
    }
  }
}

export default function MindMap() {
  const navigate = useNavigate();
  const campaignId = useSession((s) => s.campaignId);
  const userId = useSession((s) => s.userId);
  const role = useSession((s) => s.role);
  const allNotes = useNotes((s) => s.notes);
  const permissions = useNotes((s) => s.permissions);
  const setActiveNote = useNotes((s) => s.setActiveNote);
  const loadForCampaign = useNotes((s) => s.loadForCampaign);
  const subscribe = useNotes((s) => s.subscribe);

  useEffect(() => {
    if (!campaignId) return;
    loadForCampaign(campaignId);
    return subscribe(campaignId);
  }, [campaignId, loadForCampaign, subscribe]);

  // Only show notes the viewer is actually allowed to see — same gate Notes.tsx
  // uses, so the map mirrors the explorer.
  const visibleNotes = useMemo(
    () =>
      allNotes.filter((n) =>
        canViewNote(n, userId, role, permissions[n.id] ?? EMPTY_PERMS),
      ),
    [allNotes, userId, role, permissions],
  );

  // Build nodes + edges. Edge endpoints are matched by case-insensitive title.
  const { nodes, edges } = useMemo(() => {
    const byTitle = new Map<string, Note>();
    for (const n of visibleNotes) {
      if (n.title) byTitle.set(n.title.trim().toLowerCase(), n);
    }
    const ns: Node[] = visibleNotes.map((n, i) => ({
      id: n.id,
      title: n.title || 'Untitled',
      x: 400 + Math.cos((i / Math.max(1, visibleNotes.length)) * Math.PI * 2) * 200,
      y: 300 + Math.sin((i / Math.max(1, visibleNotes.length)) * Math.PI * 2) * 200,
      vx: 0,
      vy: 0,
      degree: 0,
    }));
    const es: Edge[] = [];
    const seen = new Set<string>();
    for (const n of visibleNotes) {
      for (const target of extractLinkTargets(n.body || '')) {
        const hit = byTitle.get(target.toLowerCase());
        if (!hit || hit.id === n.id) continue;
        const key = n.id < hit.id ? `${n.id}|${hit.id}` : `${hit.id}|${n.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        es.push({ from: n.id, to: hit.id });
      }
    }
    // Degree feeds the node-radius scale so hubs read at a glance.
    for (const e of es) {
      const a = ns.find((n) => n.id === e.from);
      const b = ns.find((n) => n.id === e.to);
      if (a) a.degree++;
      if (b) b.degree++;
    }
    return { nodes: ns, edges: es };
  }, [visibleNotes]);

  // Run the layout once whenever the graph shape changes. We mutate the
  // nodes in place — `positions` keeps a separately-keyed snapshot so React
  // re-renders when the sim finishes.
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  useEffect(() => {
    if (nodes.length === 0) {
      setPositions({});
      return;
    }
    // Clone before simulating so re-runs start from a fresh radial layout.
    const sim = nodes.map((n) => ({ ...n }));
    simulate(sim, edges, 800, 600);
    const next: Record<string, { x: number; y: number }> = {};
    for (const n of sim) next[n.id] = { x: n.x, y: n.y };
    setPositions(next);
  }, [nodes, edges]);

  // ── Pan / zoom on the SVG ────────────────────────────────────────────────
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const dragRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return;
    dragRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x), y: d.vy + (e.clientY - d.y) }));
  };
  const onMouseUp = () => {
    dragRef.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((v) => ({ ...v, k: Math.max(0.2, Math.min(3, v.k * factor)) }));
  };

  const openNote = (id: string) => {
    setActiveNote(id);
    navigate('/notes');
  };

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Mind Map">
        <div className="text-xs text-slate-500 flex items-center gap-2">
          <Network size={12} />
          {nodes.length} note{nodes.length === 1 ? '' : 's'} · {edges.length} link
          {edges.length === 1 ? '' : 's'}
        </div>
      </PageHeader>
      <div className="flex-1 min-h-0 relative bg-slate-950 overflow-hidden">
        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
            No notes yet — create one and use `[[Title]]` to link them.
          </div>
        ) : (
          <svg
            ref={svgRef}
            className="w-full h-full select-none"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
            style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
          >
            <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
              {edges.map((e, i) => {
                const a = positions[e.from];
                const b = positions[e.to];
                if (!a || !b) return null;
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="#475569"
                    strokeWidth={1.5}
                    strokeOpacity={0.7}
                  />
                );
              })}
              {nodes.map((n) => {
                const p = positions[n.id];
                if (!p) return null;
                const r = 8 + Math.min(12, n.degree * 1.5);
                return (
                  <g
                    key={n.id}
                    data-node
                    transform={`translate(${p.x},${p.y})`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => openNote(n.id)}
                  >
                    <circle
                      r={r}
                      fill={n.degree > 0 ? '#0ea5e9' : '#334155'}
                      stroke="#0f172a"
                      strokeWidth={2}
                    />
                    <text
                      x={r + 4}
                      y={4}
                      fontSize={12}
                      fill="#e2e8f0"
                      stroke="#0f172a"
                      strokeWidth={3}
                      paintOrder="stroke"
                    >
                      {n.title}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>
      <div className="px-4 py-1.5 text-[10px] text-slate-600 border-t border-slate-800 bg-slate-950">
        Drag empty space to pan · scroll to zoom · click a node to open the note
      </div>
    </div>
  );
}
