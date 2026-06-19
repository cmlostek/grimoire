import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useMap, MAX_DAMAGE_LOG, type DamageLogEntry, type MapShape, type MapToken } from './mapStore';
import { useInitiativeStore } from '../initiative/initiativeStore';
import { useNpcStore } from '../npcs/npcStore';
import { useSession } from '../session/sessionStore';
import { useStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { userCollabColor } from '../notes/collabProvider';
import PageHeader from '../../components/PageHeader';
import { useVisibilityReload } from '../../hooks/useVisibilityReload';
import {
  MousePointer2,
  Ruler,
  Circle as CircleIcon,
  Square as SquareIcon,
  Triangle,
  User,
  Trash2,
  Grid3x3,
  ImagePlus,
  Eraser,
  Eye,
  EyeOff,
  Radio,
  Maximize2,
  ZoomIn,
  ZoomOut,
  AlertCircle,
  Heart,
  History,
  X,
} from 'lucide-react';

type Tool = 'select' | 'ruler' | 'circle' | 'square' | 'cone' | 'token' | 'ping';

type Ping = { id: string; x: number; y: number; color: string };
type Presence = { user_id: string; display_name: string; role: 'gm' | 'player' };

// Shape palette (semi-transparent)
const SHAPE_COLORS = ['#f59e0b80', '#10b98180', '#3b82f680', '#ef444480', '#a855f780'];
const EMOJI_PRESETS = ['🧙', '🗡️', '🏹', '🛡️', '🐉', '👹', '🧌', '💀', '🐺', '🕷️', '👑', '🧚'];

// NPC.icon stores a Lucide icon key ("shield", "swords", …), not an emoji.
// The map token UI expects an actual emoji glyph, so translate when seeding
// a token from an NPC. Unknown keys fall back to the generic 🧙.
const NPC_ICON_TO_EMOJI: Record<string, string> = {
  user:     '🧙',
  crown:    '👑',
  skull:    '💀',
  shield:   '🛡️',
  swords:   '⚔️',
  book:     '📖',
  coins:    '💰',
  sparkles: '✨',
};

const uid = () => crypto.randomUUID();

type Member = { user_id: string; display_name: string; role: string; color?: string };

function appendDamageLog(
  prev: DamageLogEntry[] | undefined,
  delta: number,
  hp: number,
  by?: string,
): DamageLogEntry[] {
  const next: DamageLogEntry[] = [
    ...(prev ?? []),
    { ts: new Date().toISOString(), delta, hp, by },
  ];
  return next.length > MAX_DAMAGE_LOG ? next.slice(-MAX_DAMAGE_LOG) : next;
}

function TokenHpRow({
  token,
  canEdit,
  actorId,
  onApply,
}: {
  token: MapToken;
  canEdit: boolean;
  actorId: string | undefined;
  onApply: (patch: Partial<MapToken>) => void;
}) {
  const [logOpen, setLogOpen] = useState(false);
  const hp = token.hp ?? 0;
  const maxHp = token.maxHp ?? 0;
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  const barColor =
    pct > 60 ? 'bg-emerald-500' : pct > 25 ? 'bg-amber-500' : 'bg-rose-500';

  const commitHp = (next: number) => {
    if (next === hp) return;
    onApply({
      hp: next,
      damageLog: appendDamageLog(token.damageLog, next - hp, next, actorId),
    });
  };

  const log = token.damageLog ?? [];

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
        <Heart size={10} className="text-rose-400 shrink-0" />
        {canEdit ? (
          <>
            <input
              type="number"
              value={hp}
              onChange={(e) => commitHp(parseInt(e.target.value || '0', 10))}
              className="w-12 bg-slate-950 border border-slate-800 rounded px-1 py-0.5 font-mono text-[10px]"
            />
            <span className="text-slate-600">/</span>
            <input
              type="number"
              value={maxHp}
              onChange={(e) => onApply({ maxHp: Math.max(0, parseInt(e.target.value || '0', 10)) })}
              className="w-12 bg-slate-950 border border-slate-800 rounded px-1 py-0.5 font-mono text-[10px]"
            />
          </>
        ) : (
          <span className="font-mono">
            {maxHp > 0 ? `${hp}/${maxHp}` : '—'}
          </span>
        )}
        {log.length > 0 && (
          <button
            onClick={() => setLogOpen((v) => !v)}
            className="ml-auto text-slate-500 hover:text-slate-200"
            title={`${log.length} HP change${log.length === 1 ? '' : 's'}`}
          >
            <History size={10} />
          </button>
        )}
      </div>
      {maxHp > 0 && (
        <div className="h-1 bg-slate-800 rounded overflow-hidden">
          <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {logOpen && log.length > 0 && (
        <ul className="text-[10px] text-slate-500 font-mono max-h-24 overflow-y-auto border-t border-slate-800 pt-1 space-y-0.5">
          {[...log].reverse().map((e, i) => {
            const t = new Date(e.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const sign = e.delta > 0 ? '+' : '';
            return (
              <li key={i} className="flex justify-between gap-2">
                <span className={e.delta < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                  {sign}
                  {e.delta}
                </span>
                <span>→ {e.hp}</span>
                <span className="text-slate-700">{t}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function MapBoard() {
  const campaignId = useSession((s) => s.campaignId);
  const userId = useSession((s) => s.userId);
  const role = useSession((s) => s.role);
  const isGM = role === 'gm' || role === 'cogm';
  const displayName = useSession((s) => s.displayName);

  const state = useMap((s) => s.state);
  const tokens = useMap((s) => s.tokens);
  const mapError = useMap((s) => s.error);
  const loadForCampaign = useMap((s) => s.loadForCampaign);
  const subscribe = useMap((s) => s.subscribe);
  const setBackground = useMap((s) => s.setBackground);
  const setGridSize = useMap((s) => s.setGridSize);
  const setShowGrid = useMap((s) => s.setShowGrid);
  const addShape = useMap((s) => s.addShape);
  const removeShape = useMap((s) => s.removeShape);
  const clearShapes = useMap((s) => s.clearShapes);
  const addToken = useMap((s) => s.addToken);
  const updateToken = useMap((s) => s.updateToken);
  const removeToken = useMap((s) => s.removeToken);

  const {
    background_url: mapBgUrl,
    grid_size: mapGridSize,
    show_grid: mapShowGrid,
    shapes,
    width: canvasW,
    height: canvasH,
  } = state;

  const svgRef = useRef<SVGSVGElement>(null);

  // ── Tool state ───────────────────────────────────────────────────────────
  const [tool, setTool] = useState<Tool>('select');
  const [ruler, setRuler] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [drafting, setDrafting] = useState<{ x: number; y: number } | null>(null);
  const [selectedShapeColor, setSelectedShapeColor] = useState(SHAPE_COLORS[0]);
  const [tokenName, setTokenName] = useState('');
  const [tokenEmoji, setTokenEmoji] = useState('');
  // Optional creature template — when set, the next placed token seeds
  // hp/maxHp from this NPC's stat block. Cleared after manual edits.
  const [creatureHp, setCreatureHp] = useState<number | null>(null);
  const [creatureMaxHp, setCreatureMaxHp] = useState<number | null>(null);
  const [creatureSourceName, setCreatureSourceName] = useState<string | null>(null);
  const [draggingTokenId, setDraggingTokenId] = useState<string | null>(null);
  const [localDrag, setLocalDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [members, setMembers] = useState<Member[]>([]);

  // ── Pan / zoom ───────────────────────────────────────────────────────────
  // All token/shape coordinates are stored in logical canvas units.
  // The SVG renders a <g transform="translate(panX,panY) scale(zoom)"> wrapper
  // so everything scales consistently for all users.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  // Track whether we've performed the initial fit-to-screen (once per load).
  const didFitRef = useRef(false);

  // ── Touch support refs ────────────────────────────────────────────────────
  // Assigned every render so touch event handlers (attached once via
  // addEventListener) always read the latest values without stale closures.
  const zoomRef   = useRef(zoom);   zoomRef.current   = zoom;
  const panRef    = useRef(pan);    panRef.current    = pan;
  const localDragRef = useRef(localDrag); localDragRef.current = localDrag;
  const snapRef = useRef({ grid: mapShowGrid, size: mapGridSize });
  snapRef.current = { grid: mapShowGrid, size: mapGridSize };

  // Extra refs needed by touch token-placement and ping handlers
  const campaignIdRef  = useRef(campaignId);  campaignIdRef.current  = campaignId;
  const tokenNameRef   = useRef(tokenName);   tokenNameRef.current   = tokenName;
  const tokenEmojiRef  = useRef(tokenEmoji);  tokenEmojiRef.current  = tokenEmoji;
  const creatureHpRef    = useRef(creatureHp);    creatureHpRef.current    = creatureHp;
  const creatureMaxHpRef = useRef(creatureMaxHp); creatureMaxHpRef.current = creatureMaxHp;

  type TouchMode = 'none' | 'pan' | 'pinch' | 'drag';
  const touchModeRef  = useRef<TouchMode>('none');
  const touchPinchRef = useRef({ dist: 1, zoom: 1, midX: 0, midY: 0, panX: 0, panY: 0 });
  const touchPanRef   = useRef({ startX: 0, startY: 0, panX: 0, panY: 0 });
  const touchDragRef  = useRef({ tokenId: '', ox: 0, oy: 0 });

  // ── Presence / pings ─────────────────────────────────────────────────────
  const [pings, setPings] = useState<Ping[]>([]);
  const [viewers, setViewers] = useState<Presence[]>([]);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Load data ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!campaignId) return;
    loadForCampaign(campaignId);
    const unsub = subscribe(campaignId);
    return unsub;
  }, [campaignId, loadForCampaign, subscribe]);

  // Initiative is loaded for sidebar ordering; the Initiative panel manages
  // it primarily but the map needs the rows to sort tokens by turn order.
  const loadInitiative = useInitiativeStore((s) => s.loadForCampaign);
  const subscribeInitiative = useInitiativeStore((s) => s.subscribe);
  useEffect(() => {
    if (!campaignId) return;
    loadInitiative(campaignId);
    return subscribeInitiative(campaignId);
  }, [campaignId, loadInitiative, subscribeInitiative]);

  // NPCs and homebrew stat blocks both feed the "Add from creature" picker
  // so the GM can drop a token pre-seeded from existing source material
  // instead of typing everything by hand.
  const npcs = useNpcStore((s) => s.npcs);
  const loadNpcs = useNpcStore((s) => s.loadForCampaign);
  const subscribeNpcs = useNpcStore((s) => s.subscribe);
  useEffect(() => {
    if (!campaignId) return;
    loadNpcs(campaignId);
    return subscribeNpcs(campaignId);
  }, [campaignId, loadNpcs, subscribeNpcs]);
  const statBlocks = useStore((s) => s.statBlocks);

  type CreatureRow = {
    key: string;
    source: 'npc' | 'statblock';
    name: string;
    emoji: string;
    hp: number;
    maxHp: number;
  };
  // Combined, sorted creature list. Every NPC is shown (even ones without
  // HP set yet — the GM can edit on the token after placing); stat blocks
  // come from the local /statblocks page and use their `hp` as both
  // current and max. Sort alphabetically so it's predictable.
  const creatureRoster: CreatureRow[] = useMemo(() => {
    const rows: CreatureRow[] = [];
    for (const n of npcs) {
      const sb = n.statBlock ?? {};
      const maxHp = sb.hpMax ?? sb.hpCurrent ?? 0;
      const hp = sb.hpCurrent ?? maxHp;
      rows.push({
        key: `npc:${n.id}`,
        source: 'npc',
        name: n.name,
        emoji: NPC_ICON_TO_EMOJI[n.icon] ?? '🧙',
        hp,
        maxHp,
      });
    }
    for (const s of statBlocks) {
      // Scope to the active campaign if the stat block was filed under one.
      if (s.campaign && campaignId && s.campaign !== campaignId) continue;
      const hp = s.hp ?? 0;
      rows.push({
        key: `sb:${s.id}`,
        source: 'statblock',
        name: s.name,
        emoji: '📜',
        hp,
        maxHp: hp,
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [npcs, statBlocks, campaignId]);

  useVisibilityReload(() => {
    if (campaignId) loadForCampaign(campaignId);
  });

  // ── Keyboard: space = pan mode ───────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setIsSpaceDown(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpaceDown(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // ── Fit canvas to screen ─────────────────────────────────────────────────
  const fitToScreen = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Scale to fill 95% of the viewport while preserving the canvas aspect ratio.
    const newZoom = Math.min(rect.width / canvasW, rect.height / canvasH) * 0.95;
    setPan({
      x: (rect.width - canvasW * newZoom) / 2,
      y: (rect.height - canvasH * newZoom) / 2,
    });
    setZoom(newZoom);
  }, [canvasW, canvasH]);

  // Auto-fit once when the canvas dimensions change (new campaign load, background upload, etc.).
  // fitToScreen already captures canvasW/canvasH via useCallback, so using it as the dep
  // is equivalent to [canvasW, canvasH] without the eslint warning.
  useEffect(() => {
    if (!canvasW || !canvasH) return;
    const id = requestAnimationFrame(() => {
      fitToScreen();
    });
    return () => cancelAnimationFrame(id);
  }, [fitToScreen, canvasW, canvasH]);

  // ── Coordinate helpers ───────────────────────────────────────────────────
  // Convert a pointer event's CSS-pixel position to logical canvas coordinates.
  const screenToLogical = (e: React.MouseEvent | MouseEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };
  };

  const snap = (p: { x: number; y: number }) =>
    mapShowGrid && mapGridSize > 1
      ? {
          x: Math.round(p.x / mapGridSize) * mapGridSize,
          y: Math.round(p.y / mapGridSize) * mapGridSize,
        }
      : p;

  // ── Zoom via scroll wheel ─────────────────────────────────────────────────
  // factor > 1 = zoom in, factor < 1 = zoom out.
  // We keep the logical point under the cursor fixed during zoom by adjusting pan:
  //   panX_new = mouseX - (mouseX - panX_old) * factor
  // This works because factor == newZoom / oldZoom, and screenToLogical must equal
  // the same logical coords before and after.
  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setZoom((z) => Math.max(0.05, Math.min(10, z * factor)));
      setPan((p) => ({
        x: mx - (mx - p.x) * factor,
        y: my - (my - p.y) * factor,
      }));
    },
    [],
  );

  // Attach wheel listener with { passive: false } so preventDefault works.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  // ── Touch handlers (iPad: pinch-zoom, pan, token drag) ────────────────────
  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();

      if (e.touches.length >= 2) {
        // Two-finger gesture — start pinch+pan
        touchModeRef.current = 'pinch';
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        touchPinchRef.current = {
          dist: Math.max(1, Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)),
          zoom: zoomRef.current,
          midX: (t0.clientX + t1.clientX) / 2 - rect.left,
          midY: (t0.clientY + t1.clientY) / 2 - rect.top,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
      } else {
        const t = e.touches[0];
        const lx = (t.clientX - rect.left - panRef.current.x) / zoomRef.current;
        const ly = (t.clientY - rect.top  - panRef.current.y) / zoomRef.current;

        // Ping tool: single tap broadcasts a ping
        if (tool === 'ping') {
          broadcastPingRef.current(lx, ly);
          return;
        }

        // Token tool: tap to place a new token (GM only)
        if (tool === 'token' && isGM) {
          const cId = campaignIdRef.current;
          if (!cId) return;
          const { grid, size } = snapRef.current;
          const sx = grid && size > 1 ? Math.round(lx / size) * size : lx;
          const sy = grid && size > 1 ? Math.round(ly / size) * size : ly;
          void useMap.getState().addToken(cId, {
            name: tokenNameRef.current || 'Token',
            x: sx,
            y: sy,
            color: '#94a3b8',
            emoji: tokenEmojiRef.current || undefined,
            size: Math.max(30, size * 0.8),
            owner_user_id: userId,
            hidden_from_players: false,
            hp: creatureHpRef.current ?? undefined,
            maxHp: creatureMaxHpRef.current ?? undefined,
          });
          return;
        }

        // Check for a draggable token under the touch point (select mode only)
        if (tool === 'select') {
          const toks = useMap.getState().tokens;
          const hit = [...toks].reverse().find((tok) => {
            const ok = isGM || (tok.owner_user_id === userId && !tok.hidden_from_players);
            // Slightly enlarged hit radius for finger-friendly targeting
            return ok && Math.hypot(lx - tok.x, ly - tok.y) <= tok.size / 2 + 10 / zoomRef.current;
          });
          if (hit) {
            touchModeRef.current = 'drag';
            touchDragRef.current = { tokenId: hit.id, ox: lx - hit.x, oy: ly - hit.y };
            setDraggingTokenId(hit.id);
            setLocalDrag({ id: hit.id, x: hit.x, y: hit.y });
            return;
          }
        }

        // Default: single-finger pan
        touchModeRef.current = 'pan';
        touchPanRef.current = {
          startX: t.clientX - rect.left,
          startY: t.clientY - rect.top,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
      }
    },
    [tool, isGM, userId],
  );

  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();

      if (touchModeRef.current === 'pinch' && e.touches.length >= 2) {
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const { dist: sd, zoom: sz, midX, midY, panX, panY } = touchPinchRef.current;
        const d = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        const newZoom = Math.max(0.05, Math.min(10, sz * (d / sd)));
        // Current midpoint between fingers (SVG-local CSS pixels)
        const cx = (t0.clientX + t1.clientX) / 2 - rect.left;
        const cy = (t0.clientY + t1.clientY) / 2 - rect.top;
        // Keep the logical point that was under the initial pinch centre fixed
        const lx = (midX - panX) / sz;
        const ly = (midY - panY) / sz;
        setZoom(newZoom);
        setPan({ x: cx - lx * newZoom, y: cy - ly * newZoom });

      } else if (touchModeRef.current === 'pan' && e.touches.length === 1) {
        const t = e.touches[0];
        const { startX, startY, panX, panY } = touchPanRef.current;
        setPan({
          x: panX + (t.clientX - rect.left - startX),
          y: panY + (t.clientY - rect.top  - startY),
        });

      } else if (touchModeRef.current === 'drag' && e.touches.length === 1) {
        const t = e.touches[0];
        const lx = (t.clientX - rect.left - panRef.current.x) / zoomRef.current;
        const ly = (t.clientY - rect.top  - panRef.current.y) / zoomRef.current;
        const { tokenId, ox, oy } = touchDragRef.current;
        setLocalDrag({ id: tokenId, x: lx - ox, y: ly - oy });
      }
    },
    [],
  );

  const onTouchEnd = useCallback(
    (e: TouchEvent) => {
      e.preventDefault();

      if (touchModeRef.current === 'drag') {
        const { tokenId } = touchDragRef.current;
        const drag = localDragRef.current;
        if (tokenId && drag) {
          // Snap to grid on commit (same as mouse drag)
          const { grid, size } = snapRef.current;
          const x = grid && size > 1 ? Math.round(drag.x / size) * size : drag.x;
          const y = grid && size > 1 ? Math.round(drag.y / size) * size : drag.y;
          void useMap.getState().updateToken(tokenId, { x, y });
        }
        setDraggingTokenId(null);
        setLocalDrag(null);
      }

      if (e.touches.length === 1) {
        // Lifting one finger during a pinch — continue as a single-finger pan
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const t = e.touches[0];
        touchModeRef.current = 'pan';
        touchPanRef.current = {
          startX: t.clientX - rect.left,
          startY: t.clientY - rect.top,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
      } else if (e.touches.length === 0) {
        touchModeRef.current = 'none';
      }
    },
    [],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener('touchstart',  onTouchStart, { passive: false });
    svg.addEventListener('touchmove',   onTouchMove,  { passive: false });
    svg.addEventListener('touchend',    onTouchEnd,   { passive: false });
    svg.addEventListener('touchcancel', onTouchEnd,   { passive: false });
    return () => {
      svg.removeEventListener('touchstart',  onTouchStart);
      svg.removeEventListener('touchmove',   onTouchMove);
      svg.removeEventListener('touchend',    onTouchEnd);
      svg.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [onTouchStart, onTouchMove, onTouchEnd]);

  // ── Presence channel ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!campaignId || !userId) return;
    const channel = supabase.channel(`map-presence:${campaignId}`, {
      config: { presence: { key: userId } },
    });
    presenceChannelRef.current = channel;

    channel.on('broadcast', { event: 'ping' }, (payload) => {
      const p = payload.payload as { id: string; x: number; y: number; color: string };
      setPings((curr) => [...curr, p]);
      window.setTimeout(() => setPings((curr) => curr.filter((x) => x.id !== p.id)), 2200);
    });

    channel.on('presence', { event: 'sync' }, () => {
      const s = channel.presenceState();
      const next: Presence[] = [];
      for (const userKey of Object.keys(s)) {
        const entries = s[userKey] as unknown as Array<{ user_id?: string; display_name?: string; role?: 'gm' | 'player' }>;
        const e = entries[0];
        if (!e?.user_id || !e?.display_name || !e?.role) continue;
        next.push({ user_id: e.user_id, display_name: e.display_name, role: e.role });
      }
      setViewers(next);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && role && displayName) {
        await channel.track({ user_id: userId, display_name: displayName, role });
      }
    });

    return () => {
      supabase.removeChannel(channel);
      presenceChannelRef.current = null;
    };
  }, [campaignId, userId, role, displayName]);

  // ── Fetch campaign members ───────────────────────────────────────────────
  // Loaded for everyone (not just GMs) so player tokens can render in each
  // owner's chosen chat color, mirroring how their messages look.
  useEffect(() => {
    if (!campaignId) return;
    (async () => {
      const { data } = await supabase
        .from('campaign_members')
        .select('user_id, display_name, role, color')
        .eq('campaign_id', campaignId);
      setMembers((data ?? []) as Member[]);
    })();
  }, [campaignId]);

  // ── Ping broadcast ────────────────────────────────────────────────────────
  const broadcastPing = (x: number, y: number) => {
    const channel = presenceChannelRef.current;
    if (!channel || !userId) return;
    const { color } = userCollabColor(userId);
    const ping: Ping = { id: crypto.randomUUID(), x, y, color };
    channel.send({ type: 'broadcast', event: 'ping', payload: ping });
    setPings((curr) => [...curr, ping]);
    window.setTimeout(() => setPings((curr) => curr.filter((x) => x.id !== ping.id)), 2200);
  };

  // Keep a stable ref so touch handlers can call broadcastPing without
  // needing it in their useCallback deps.
  const broadcastPingRef = useRef(broadcastPing);
  broadcastPingRef.current = broadcastPing;

  // ── Token drag logic ──────────────────────────────────────────────────────
  const canDragToken = (t: MapToken) =>
    isGM || (t.owner_user_id === userId && !t.hidden_from_players);

  const commitDrag = () => {
    if (draggingTokenId && localDrag) {
      updateToken(draggingTokenId, { x: localDrag.x, y: localDrag.y });
    }
    setDraggingTokenId(null);
    setLocalDrag(null);
  };

  useEffect(() => {
    const up = () => {
      isPanningRef.current = false;
      if (draggingTokenId) commitDrag();
      setDrafting(null);
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingTokenId, localDrag]);

  // ── Mouse handlers ────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    if (draggingTokenId) return;
    if (!campaignId) return;

    // Middle button or space+left → pan
    if (e.button === 1 || (e.button === 0 && isSpaceDown)) {
      e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      return;
    }

    const p = screenToLogical(e);

    if (tool === 'ping') {
      broadcastPing(p.x, p.y);
      return;
    }

    // Ruler is available to everyone, not just the GM.
    if (tool === 'ruler') {
      setRuler({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      return;
    }

    if (!isGM) return;
    if (tool === 'circle' || tool === 'square' || tool === 'cone') {
      setDrafting(p);
      return;
    }
    if (tool === 'token') {
      const sp = snap(p);
      const tokenSize = Math.max(30, mapGridSize * 0.8);
      void addToken(campaignId, {
        name: tokenName || 'Token',
        x: sp.x,
        y: sp.y,
        color: '#94a3b8', // neutral default; overridden visually by owner color
        emoji: tokenEmoji || undefined,
        size: tokenSize,
        owner_user_id: userId,
        hidden_from_players: false,
        hp: creatureHp ?? undefined,
        maxHp: creatureMaxHp ?? undefined,
      });
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.mouseX;
      const dy = e.clientY - panStartRef.current.mouseY;
      setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
      return;
    }

    const p = screenToLogical(e);

    if (draggingTokenId) {
      const sp = snap({ x: p.x - dragOffset.x, y: p.y - dragOffset.y });
      setLocalDrag({ id: draggingTokenId, x: sp.x, y: sp.y });
      return;
    }
    if (ruler && tool === 'ruler') {
      setRuler({ ...ruler, x2: p.x, y2: p.y });
    }
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }
    if (draggingTokenId) {
      commitDrag();
      return;
    }
    if (drafting && isGM && campaignId) {
      const p = screenToLogical(e);
      const dx = p.x - drafting.x;
      const dy = p.y - drafting.y;
      let shape: MapShape | null = null;
      if (tool === 'circle') {
        const r = Math.hypot(dx, dy);
        if (r > 4) shape = { id: uid(), kind: 'circle', x: drafting.x, y: drafting.y, r, color: selectedShapeColor };
      } else if (tool === 'square') {
        if (Math.abs(dx) > 4 && Math.abs(dy) > 4) {
          shape = {
            id: uid(),
            kind: 'square',
            x: Math.min(drafting.x, p.x),
            y: Math.min(drafting.y, p.y),
            w: Math.abs(dx),
            h: Math.abs(dy),
            color: selectedShapeColor,
          };
        }
      } else if (tool === 'cone') {
        if (Math.hypot(dx, dy) > 4) {
          shape = { id: uid(), kind: 'cone', x: drafting.x, y: drafting.y, dx, dy, color: selectedShapeColor };
        }
      }
      if (shape) void addShape(campaignId, shape);
      setDrafting(null);
    }
  };

  // ── Background image loading ──────────────────────────────────────────────
  const onLoadBg = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isGM || !campaignId) return;
    const f = e.target.files?.[0];
    if (!f) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Detect natural image dimensions so the canvas matches the image exactly.
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || canvasW;
        const h = img.naturalHeight || canvasH;
        // my last resort or im losing my mind
        const dimensionsChanged = w !== canvasW || h !== canvasH;
        void setBackground(campaignId, dataUrl, w, h);
        if (!dimensionsChanged) requestAnimationFrame(fitToScreen);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(f);
    // Reset so the same file can be picked again if needed.
    e.target.value = '';
  };

  // ── Computed values ───────────────────────────────────────────────────────
  const rulerDistance = ruler
    ? ((Math.hypot(ruler.x2 - ruler.x1, ruler.y2 - ruler.y1) / mapGridSize) * 5).toFixed(1)
    : '0';

  const visibleTokens = tokens.map((t) => {
    if (localDrag && localDrag.id === t.id) return { ...t, x: localDrag.x, y: localDrag.y };
    return t;
  });

  // Sidebar order: match each token to an initiative combatant by name
  // (case-insensitive) and use that initiative as the sort key — highest
  // first, ties broken by turn_order so the in-encounter sequence is stable.
  // Tokens with no matching combatant fall to the end alphabetically.
  const combatants = useInitiativeStore((s) => s.combatants);
  const sidebarTokens = useMemo(() => {
    const byName = new Map<string, { initiative: number; turnOrder: number }>();
    for (const c of combatants) {
      byName.set(c.name.trim().toLowerCase(), { initiative: c.initiative, turnOrder: c.turnOrder });
    }
    return [...visibleTokens].sort((a, b) => {
      const ai = byName.get(a.name.trim().toLowerCase());
      const bi = byName.get(b.name.trim().toLowerCase());
      if (ai && bi) {
        if (bi.initiative !== ai.initiative) return bi.initiative - ai.initiative;
        return ai.turnOrder - bi.turnOrder;
      }
      if (ai) return -1;
      if (bi) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [visibleTokens, combatants]);

  // Get the display color for a token: when an owner is set, prefer their
  // chosen campaign color (matches their chat / cursor); fall back to the
  // deterministic collab hash if we haven't loaded members yet, then to the
  // token's stored color when there's no owner.
  const memberColorById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of members) if (r.color) m.set(r.user_id, r.color);
    return m;
  }, [members]);
  const tokenDisplayColor = (t: MapToken): string => {
    if (t.owner_user_id) {
      return memberColorById.get(t.owner_user_id) ?? userCollabColor(t.owner_user_id).color;
    }
    return t.color;
  };

  const toolButton = (t: Tool, Icon: React.ComponentType<{ size?: number }>, label: string, gmOnly = false) => {
    if (gmOnly && !isGM) return null;
    return (
      <button
        onClick={() => { setTool(t); setRuler(null); }}
        title={label}
        className={`p-2 rounded border ${
          tool === t
            ? 'bg-sky-900/40 border-sky-700 text-sky-200'
            : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
        }`}
      >
        <Icon size={16} />
      </button>
    );
  };

  // Cursor: space = grab (pan mode), drawing tools = crosshair, otherwise default.
  const svgCursor = isSpaceDown
    ? 'grab'
    : tool === 'ping' || (isGM && tool !== 'select')
    ? 'crosshair'
    : 'default';

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Map">
        {isGM && (
          <>
            <label className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded cursor-pointer flex items-center gap-1">
              <ImagePlus size={14} /> Load background
              <input type="file" accept="image/*" onChange={onLoadBg} className="hidden" />
            </label>
            {mapBgUrl && (
              <button
                onClick={() => campaignId && void setBackground(campaignId, null)}
                className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded"
              >
                Remove bg
              </button>
            )}
            <button
              onClick={() => campaignId && void setShowGrid(campaignId, !mapShowGrid)}
              className={`px-3 py-1.5 text-xs rounded flex items-center gap-1 ${
                mapShowGrid ? 'bg-sky-900/40 text-sky-200' : 'bg-slate-800 text-slate-300'
              }`}
            >
              <Grid3x3 size={14} /> Grid
            </button>
            <label className="text-xs text-slate-400 flex items-center gap-1">
              Cell
              <input
                type="number"
                min="1"
                value={mapGridSize}
                onChange={(e) => campaignId && void setGridSize(campaignId, Math.max(1, parseInt(e.target.value || '1', 10)))}
                className="w-14 bg-slate-900 border border-slate-800 rounded px-1 py-1 font-mono"
              />
              px
            </label>
          </>
        )}
      </PageHeader>

      <div className="flex-1 min-h-0 flex">
        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className="w-56 border-r border-slate-800 p-3 space-y-4 overflow-y-auto text-sm shrink-0">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Tools</div>
            <div className="grid grid-cols-3 gap-1">
              {toolButton('select', MousePointer2, 'Select / drag')}
              {toolButton('ping', Radio, 'Ping — click to flash a marker for everyone')}
              {toolButton('ruler', Ruler, 'Ruler (5 ft/cell)')}
              {toolButton('token', User, 'Place token', true)}
              {toolButton('circle', CircleIcon, 'Circle AoE', true)}
              {toolButton('square', SquareIcon, 'Square AoE', true)}
              {toolButton('cone', Triangle, 'Cone AoE', true)}
            </div>
            <div className="flex gap-1 mt-1">
              <button
                onClick={fitToScreen}
                title="Fit map to screen"
                className="flex-1 py-1.5 rounded border text-xs flex items-center justify-center gap-1 bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <Maximize2 size={13} /> Fit
              </button>
              <button
                onClick={() => setZoom((z) => Math.min(10, z * 1.25))}
                title="Zoom in"
                className="p-1.5 rounded border bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800"
              >
                <ZoomIn size={14} />
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(0.05, z / 1.25))}
                title="Zoom out"
                className="p-1.5 rounded border bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800"
              >
                <ZoomOut size={14} />
              </button>
            </div>
            <div className="mt-1 text-[10px] text-slate-600 text-center">
              {Math.round(zoom * 100)}% · Hold Space+drag or scroll to zoom
            </div>
          </div>

          {isGM && tool === 'token' && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-slate-500">Token</div>
              <input
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                placeholder="Name"
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs"
              />
              <div>
                <div className="text-[10px] text-slate-500 mb-1">Icon</div>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setTokenEmoji('')}
                    className={`w-7 h-7 rounded border text-xs ${
                      tokenEmoji === '' ? 'bg-slate-700 border-sky-600' : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    —
                  </button>
                  {EMOJI_PRESETS.map((em) => (
                    <button
                      key={em}
                      onClick={() => setTokenEmoji(em)}
                      className={`w-7 h-7 rounded border text-base leading-none ${
                        tokenEmoji === em ? 'bg-slate-700 border-sky-600' : 'bg-slate-900 border-slate-800'
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
                <input
                  value={tokenEmoji}
                  onChange={(e) => setTokenEmoji(e.target.value.slice(0, 2))}
                  placeholder="Custom emoji"
                  className="mt-1 w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs"
                />
              </div>
              <div className="text-[10px] text-slate-500 italic">
                Token color uses your profile color automatically.
              </div>

              {/* Creature picker: pull a stat-blocked NPC and seed the next
                  placed token from it. Clears as soon as the next token is
                  dropped via the touch path; the mouse path also reads the
                  current state value. */}
              <div className="border-t border-slate-800 pt-2 space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">
                  Add from creature
                </div>
                {creatureSourceName && (
                  <div className="flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-950/40 border border-emerald-900/50 rounded px-2 py-1">
                    <span className="flex-1 truncate">
                      {creatureSourceName} · HP {creatureHp ?? '—'}/{creatureMaxHp ?? '—'}
                    </span>
                    <button
                      onClick={() => {
                        setCreatureSourceName(null);
                        setCreatureHp(null);
                        setCreatureMaxHp(null);
                      }}
                      className="text-slate-400 hover:text-rose-300"
                      title="Clear creature template"
                    >
                      <X size={10} />
                    </button>
                  </div>
                )}
                {creatureRoster.length === 0 ? (
                  <div className="text-[10px] text-slate-600 italic">
                    No NPCs or stat blocks yet — add one on the NPCs or Stat Blocks page.
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {creatureRoster.map((row) => (
                      <button
                        key={row.key}
                        onClick={() => {
                          setTokenName(row.name);
                          setTokenEmoji(row.emoji);
                          setCreatureHp(row.maxHp || null);
                          setCreatureMaxHp(row.maxHp || null);
                          setCreatureSourceName(row.name);
                        }}
                        className="w-full text-left flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-slate-900 text-[11px] text-slate-300"
                      >
                        <span className="shrink-0 text-base leading-none">{row.emoji}</span>
                        <span className="flex-1 truncate">{row.name}</span>
                        <span
                          className="text-[9px] uppercase tracking-wider text-slate-600 shrink-0"
                          title={row.source === 'npc' ? 'From NPCs' : 'From Stat Blocks'}
                        >
                          {row.source === 'npc' ? 'npc' : 'sb'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono shrink-0 w-12 text-right">
                          {row.maxHp > 0 ? `${row.hp}/${row.maxHp}` : '—'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {isGM && (tool === 'circle' || tool === 'square' || tool === 'cone') && (
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Shape color</div>
              <div className="flex flex-wrap gap-1">
                {SHAPE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setSelectedShapeColor(c)}
                    style={{ background: c }}
                    className={`w-5 h-5 rounded border-2 ${
                      selectedShapeColor === c ? 'border-white' : 'border-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">
              Tokens ({sidebarTokens.length})
            </div>
            <div className="space-y-1">
              {sidebarTokens.map((t) => {
                const dispColor = tokenDisplayColor(t);
                return (
                  <div
                    key={t.id}
                    className={`flex flex-col gap-1 text-xs bg-slate-900 border rounded px-2 py-1 ${
                      t.owner_user_id === userId && userId
                        ? 'border-emerald-700'
                        : 'border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        style={{ background: dispColor }}
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0"
                      >
                        {t.emoji}
                      </div>
                      <input
                        value={t.name}
                        onChange={(e) => void updateToken(t.id, { name: e.target.value })}
                        readOnly={!isGM}
                        className="flex-1 bg-transparent outline-none min-w-0"
                      />
                      {isGM && (
                        <>
                          <button
                            onClick={() => void updateToken(t.id, { hidden_from_players: !t.hidden_from_players })}
                            title={t.hidden_from_players ? 'Hidden from players' : 'Visible to players'}
                            className={t.hidden_from_players ? 'text-slate-600' : 'text-emerald-500'}
                          >
                            {t.hidden_from_players ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          <button
                            onClick={() => void removeToken(t.id)}
                            className="text-slate-600 hover:text-rose-400"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                    <TokenHpRow
                      token={t}
                      canEdit={isGM || (!!userId && t.owner_user_id === userId)}
                      actorId={userId ?? undefined}
                      onApply={(patch) => void updateToken(t.id, patch)}
                    />
                    {isGM && (
                      <select
                        value={t.owner_user_id ?? ''}
                        onChange={(e) => void updateToken(t.id, { owner_user_id: e.target.value || null })}
                        className="bg-slate-950 border border-slate-800 rounded px-1 py-0.5 text-[10px] text-slate-400"
                      >
                        <option value="">Unassigned (GM only)</option>
                        {members.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.display_name} {m.role === 'gm' ? '(GM)' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {isGM && shapes.length > 0 && (
            <button
              onClick={() => campaignId && void clearShapes(campaignId)}
              className="w-full px-2 py-1.5 text-xs bg-slate-800 hover:bg-rose-900 rounded flex items-center justify-center gap-1"
            >
              <Eraser size={12} /> Clear {shapes.length} shape{shapes.length === 1 ? '' : 's'}
            </button>
          )}

          {mapError && (
            <div className="flex items-start gap-1.5 text-[11px] text-rose-400 bg-rose-950/30 border border-rose-800/50 rounded p-2">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>{mapError}</span>
            </div>
          )}
        </aside>

        {/* ── Canvas ─────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 relative bg-slate-950 overflow-hidden">
          {/* Ruler readout */}
          {ruler && tool === 'ruler' && (
            <div className="absolute top-3 left-3 z-10 px-3 py-1.5 bg-slate-950/80 border border-slate-700 rounded font-mono text-xs text-sky-200">
              {rulerDistance} ft
            </div>
          )}

          {/* Viewer avatar stack */}
          <div className="absolute top-3 right-3 z-10 flex -space-x-2">
            {viewers.map((v) => {
              const initials = (v.display_name || '?').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
              const isMe = v.user_id === userId;
              const { color } = userCollabColor(v.user_id);
              return (
                <div
                  key={v.user_id}
                  title={`${v.display_name}${v.role === 'gm' ? ' (GM)' : ''}${isMe ? ' — you' : ''}`}
                  className={`w-7 h-7 rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] font-semibold text-white ${isMe ? 'ring-2 ring-white' : ''}`}
                  style={{ backgroundColor: color }}
                >
                  {initials}
                </div>
              );
            })}
          </div>

          {/* Hint bar */}
          <div className="absolute bottom-3 left-3 z-10 text-[10px] text-slate-500 bg-slate-950/70 px-2 py-1 rounded">
            {tool === 'ping'
              ? 'Click anywhere to ping — everyone sees it flash.'
              : isGM
              ? 'Double-click token/shape to remove · Dashed = hidden from players · Scroll to zoom · Space+drag to pan'
              : 'Drag your own token · Scroll to zoom · Space+drag to pan'}
          </div>

          <svg
            ref={svgRef}
            className="absolute inset-0 w-full h-full select-none"
            style={{ cursor: svgCursor, touchAction: 'none' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
          >
            {/* Everything inside this <g> is in logical canvas coordinates.
                All pan/zoom is handled by this single transform — tokens stored
                at (x, y) always appear at the same map location for every client,
                regardless of screen size or current zoom level. */}
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>

              {/* Canvas border / background */}
              <rect
                x={0} y={0}
                width={canvasW} height={canvasH}
                fill="#0f172a"
                stroke="#334155"
                strokeWidth={2 / zoom}
              />

              {/* Background image — canvas dimensions are set to the image's
                  natural pixel size on upload, so this fills exactly 1:1. */}
              {mapBgUrl && (
                <image
                  href={mapBgUrl}
                  x={0} y={0}
                  width={canvasW} height={canvasH}
                  preserveAspectRatio="none"
                />
              )}

              {/* Grid overlay */}
              {mapShowGrid && mapGridSize >= 4 && (
                <g>
                  <defs>
                    <pattern
                      id="map-grid"
                      width={mapGridSize}
                      height={mapGridSize}
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d={`M ${mapGridSize} 0 L 0 0 0 ${mapGridSize}`}
                        fill="none"
                        stroke="#ffffff18"
                        strokeWidth={1 / zoom}
                      />
                    </pattern>
                  </defs>
                  <rect
                    x={0} y={0}
                    width={canvasW} height={canvasH}
                    fill="url(#map-grid)"
                    pointerEvents="none"
                  />
                </g>
              )}

              {/* Shapes */}
              {shapes.map((s) => {
                const onDbl = isGM && campaignId ? () => void removeShape(campaignId, s.id) : undefined;
                if (s.kind === 'circle') {
                  return (
                    <circle
                      key={s.id} cx={s.x} cy={s.y} r={s.r}
                      fill={s.color} stroke={s.color.slice(0, 7)} strokeWidth={2 / zoom}
                      onDoubleClick={onDbl}
                    />
                  );
                }
                if (s.kind === 'square') {
                  return (
                    <rect
                      key={s.id} x={s.x} y={s.y} width={s.w} height={s.h}
                      fill={s.color} stroke={s.color.slice(0, 7)} strokeWidth={2 / zoom}
                      onDoubleClick={onDbl}
                    />
                  );
                }
                if (s.kind === 'cone') {
                  const len = Math.hypot(s.dx, s.dy);
                  if (len === 0) return null;
                  const ux = s.dx / len; const uy = s.dy / len;
                  const px = -uy; const py = ux;
                  const half = len / 2;
                  const tipX = s.x + s.dx; const tipY = s.y + s.dy;
                  return (
                    <polygon
                      key={s.id}
                      points={`${s.x},${s.y} ${tipX + px * half},${tipY + py * half} ${tipX - px * half},${tipY - py * half}`}
                      fill={s.color} stroke={s.color.slice(0, 7)} strokeWidth={2 / zoom}
                      onDoubleClick={onDbl}
                    />
                  );
                }
                return null;
              })}

              {/* Ruler */}
              {ruler && tool === 'ruler' && (
                <g pointerEvents="none">
                  <line
                    x1={ruler.x1} y1={ruler.y1} x2={ruler.x2} y2={ruler.y2}
                    stroke="#fbbf24" strokeWidth={2 / zoom} strokeDasharray={`${6 / zoom} ${4 / zoom}`}
                  />
                  <circle cx={ruler.x1} cy={ruler.y1} r={4 / zoom} fill="#fbbf24" />
                  <circle cx={ruler.x2} cy={ruler.y2} r={4 / zoom} fill="#fbbf24" />
                </g>
              )}

              {/* Tokens */}
              {visibleTokens.map((t) => {
                const draggable = canDragToken(t) && tool === 'select';
                const dispColor = tokenDisplayColor(t);
                const r = t.size / 2;
                const labelY = t.y + r + Math.max(10, 14 / zoom);
                const fontSize = Math.max(8, 11 / zoom);

                return (
                  <g
                    key={t.id}
                    style={{ cursor: draggable ? 'grab' : 'default' }}
                    onMouseDown={(e) => {
                      if (!draggable) return;
                      e.stopPropagation();
                      const p = screenToLogical(e);
                      setDraggingTokenId(t.id);
                      setLocalDrag({ id: t.id, x: t.x, y: t.y });
                      setDragOffset({ x: p.x - t.x, y: p.y - t.y });
                    }}
                    onDoubleClick={isGM ? () => void removeToken(t.id) : undefined}
                  >
                    {/* Outer ring in owner's color */}
                    <circle
                      cx={t.x} cy={t.y} r={r + 2 / zoom}
                      fill="none"
                      stroke={dispColor}
                      strokeWidth={3 / zoom}
                      strokeDasharray={t.hidden_from_players ? `${6 / zoom} ${3 / zoom}` : undefined}
                    />
                    {/* Token body */}
                    <circle
                      cx={t.x} cy={t.y} r={r}
                      fill={dispColor + '55'}
                      stroke={dispColor}
                      strokeWidth={1.5 / zoom}
                    />
                    {/* Emoji icon — dominantBaseline="central" + dy offset centres
                        the glyph both horizontally and vertically inside the circle */}
                    {t.emoji && (
                      <text
                        x={t.x} y={t.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={r * 1.1}
                        pointerEvents="none"
                      >
                        {t.emoji}
                      </text>
                    )}
                    {/* HP bar — drawn directly above the token when maxHp set */}
                    {(t.maxHp ?? 0) > 0 && (() => {
                      const barW = r * 1.8;
                      const barH = Math.max(2, 4 / zoom);
                      const barX = t.x - barW / 2;
                      const barY = t.y - r - barH - 2 / zoom;
                      const pct = Math.max(0, Math.min(1, (t.hp ?? 0) / (t.maxHp ?? 1)));
                      const fill = pct > 0.6 ? '#10b981' : pct > 0.25 ? '#f59e0b' : '#ef4444';
                      return (
                        <g pointerEvents="none">
                          <rect x={barX} y={barY} width={barW} height={barH} fill="#0f172a" opacity={0.7} rx={barH / 2} />
                          <rect x={barX} y={barY} width={barW * pct} height={barH} fill={fill} rx={barH / 2} />
                        </g>
                      );
                    })()}
                    {/* Name label */}
                    <text
                      x={t.x} y={labelY}
                      textAnchor="middle"
                      fontSize={fontSize}
                      fill="#fafaf9"
                      stroke="#0f172a"
                      strokeWidth={3 / zoom}
                      paintOrder="stroke"
                      pointerEvents="none"
                    >
                      {t.name}
                    </text>
                    {/* Tooltip exposing current HP on hover (works even for non-editors) */}
                    {(t.maxHp ?? 0) > 0 && (
                      <title>{`${t.name} — HP ${t.hp ?? 0}/${t.maxHp ?? 0}`}</title>
                    )}
                  </g>
                );
              })}

              {/* Ping pulses */}
              {pings.map((p) => (
                <g key={p.id} pointerEvents="none">
                  <circle cx={p.x} cy={p.y} r={6 / zoom} fill={p.color} className="map-ping-dot" />
                  <circle cx={p.x} cy={p.y} r={6 / zoom} fill="none" stroke={p.color} strokeWidth={3 / zoom} className="map-ping-ring" />
                </g>
              ))}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
