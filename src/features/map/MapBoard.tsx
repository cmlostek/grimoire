import { useRef, useState, useEffect } from 'react';
import { useStore, MapShape } from '../../store';
import PageHeader from '../../components/PageHeader';
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
} from 'lucide-react';

type Tool = 'select' | 'ruler' | 'circle' | 'square' | 'cone' | 'token';

const TOKEN_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#a855f7', '#ec4899', '#f97316', '#14b8a6'];
const SHAPE_COLORS = ['#f59e0b80', '#10b98180', '#3b82f680', '#ef444480', '#a855f780'];
const EMOJI_PRESETS = ['🧙', '🗡️', '🏹', '🛡️', '🐉', '👹', '🧌', '💀', '🐺', '🕷️', '👑', '🧚'];

const uid = () => crypto.randomUUID();

export default function MapBoard() {
  const {
    mapBgUrl,
    mapGridSize,
    mapShowGrid,
    tokens,
    shapes,
    setMapBg,
    setMapGridSize,
    setShowGrid,
    addToken,
    updateToken,
    removeToken,
    addShape,
    removeShape,
    clearShapes,
  } = useStore();

  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [ruler, setRuler] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [drafting, setDrafting] = useState<{ x: number; y: number } | null>(null);
  const [selectedColor, setSelectedColor] = useState(TOKEN_COLORS[0]);
  const [selectedShapeColor, setSelectedShapeColor] = useState(SHAPE_COLORS[0]);
  const [tokenName, setTokenName] = useState('');
  const [tokenEmoji, setTokenEmoji] = useState('');
  const [draggingTokenId, setDraggingTokenId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const getPoint = (e: React.MouseEvent | MouseEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const snap = (p: { x: number; y: number }) =>
    mapShowGrid
      ? {
          x: Math.round(p.x / mapGridSize) * mapGridSize,
          y: Math.round(p.y / mapGridSize) * mapGridSize,
        }
      : p;

  const onMouseDown = (e: React.MouseEvent) => {
    if (draggingTokenId) return;
    const p = getPoint(e);
    if (tool === 'ruler') {
      setRuler({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      return;
    }
    if (tool === 'circle' || tool === 'square' || tool === 'cone') {
      setDrafting(p);
      return;
    }
    if (tool === 'token') {
      const sp = snap(p);
      addToken({
        name: tokenName || 'Token',
        x: sp.x,
        y: sp.y,
        color: selectedColor,
        emoji: tokenEmoji || undefined,
        size: mapGridSize * 0.9,
      });
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const p = getPoint(e);
    if (draggingTokenId) {
      const sp = snap({ x: p.x - dragOffset.x, y: p.y - dragOffset.y });
      updateToken(draggingTokenId, { x: sp.x, y: sp.y });
      return;
    }
    if (ruler && tool === 'ruler') {
      setRuler({ ...ruler, x2: p.x, y2: p.y });
    }
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (draggingTokenId) {
      setDraggingTokenId(null);
      return;
    }
    if (drafting) {
      const p = getPoint(e);
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
      if (shape) addShape(shape);
      setDrafting(null);
    }
  };

  useEffect(() => {
    const up = () => {
      setDraggingTokenId(null);
      setDrafting(null);
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  const onLoadBg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setMapBg(reader.result as string);
    reader.readAsDataURL(f);
  };

  const rulerDistance = ruler
    ? ((Math.hypot(ruler.x2 - ruler.x1, ruler.y2 - ruler.y1) / mapGridSize) * 5).toFixed(1)
    : '0';

  const toolButton = (t: Tool, Icon: any, label: string) => (
    <button
      onClick={() => {
        setTool(t);
        setRuler(null);
      }}
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

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Map">
        <label className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded cursor-pointer flex items-center gap-1">
          <ImagePlus size={14} /> Load background
          <input type="file" accept="image/*" onChange={onLoadBg} className="hidden" />
        </label>
        {mapBgUrl && (
          <button
            onClick={() => setMapBg(null)}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded"
          >
            Remove bg
          </button>
        )}
        <button
          onClick={() => setShowGrid(!mapShowGrid)}
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
            value={mapGridSize}
            onChange={(e) => setMapGridSize(parseInt(e.target.value || '50', 10))}
            className="w-14 bg-slate-900 border border-slate-800 rounded px-1 py-1 font-mono"
          />
          px
        </label>
      </PageHeader>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-56 border-r border-slate-800 p-3 space-y-4 overflow-y-auto text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Tools</div>
            <div className="grid grid-cols-3 gap-1">
              {toolButton('select', MousePointer2, 'Select / drag')}
              {toolButton('ruler', Ruler, 'Ruler')}
              {toolButton('token', User, 'Place token')}
              {toolButton('circle', CircleIcon, 'Circle')}
              {toolButton('square', SquareIcon, 'Square')}
              {toolButton('cone', Triangle, 'Cone')}
            </div>
          </div>

          {tool === 'token' && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-slate-500">Token</div>
              <input
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                placeholder="Name"
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs"
              />
              <div>
                <div className="text-[10px] text-slate-500 mb-1">Color</div>
                <div className="flex flex-wrap gap-1">
                  {TOKEN_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setSelectedColor(c)}
                      style={{ background: c }}
                      className={`w-5 h-5 rounded-full border-2 ${
                        selectedColor === c ? 'border-white' : 'border-transparent'
                      }`}
                    />
                  ))}
                </div>
              </div>
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
                  {EMOJI_PRESETS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setTokenEmoji(e)}
                      className={`w-7 h-7 rounded border text-base leading-none ${
                        tokenEmoji === e ? 'bg-slate-700 border-sky-600' : 'bg-slate-900 border-slate-800'
                      }`}
                    >
                      {e}
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
            </div>
          )}

          {(tool === 'circle' || tool === 'square' || tool === 'cone') && (
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
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Tokens ({tokens.length})</div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {tokens.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 text-xs bg-slate-900 border border-slate-800 rounded px-2 py-1"
                >
                  <div
                    style={{ background: t.color }}
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[10px]"
                  >
                    {t.emoji}
                  </div>
                  <input
                    value={t.name}
                    onChange={(e) => updateToken(t.id, { name: e.target.value })}
                    className="flex-1 bg-transparent outline-none min-w-0"
                  />
                  <button
                    onClick={() => removeToken(t.id)}
                    className="text-slate-600 hover:text-rose-400"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {shapes.length > 0 && (
            <button
              onClick={clearShapes}
              className="w-full px-2 py-1.5 text-xs bg-slate-800 hover:bg-rose-900 rounded flex items-center justify-center gap-1"
            >
              <Eraser size={12} /> Clear {shapes.length} shape{shapes.length === 1 ? '' : 's'}
            </button>
          )}
        </aside>

        <div className="flex-1 min-w-0 relative bg-slate-900 overflow-auto">
          {ruler && tool === 'ruler' && (
            <div className="absolute top-3 left-3 z-10 px-3 py-1.5 bg-slate-950/80 border border-slate-700 rounded font-mono text-xs text-sky-200">
              {rulerDistance} ft
            </div>
          )}
          <svg
            ref={svgRef}
            className="block w-full h-full select-none"
            style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
          >
            {mapBgUrl && <image href={mapBgUrl} x={0} y={0} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />}

            {mapShowGrid && (
              <g>
                <defs>
                  <pattern id="grid" width={mapGridSize} height={mapGridSize} patternUnits="userSpaceOnUse">
                    <path
                      d={`M ${mapGridSize} 0 L 0 0 0 ${mapGridSize}`}
                      fill="none"
                      stroke="#ffffff18"
                      strokeWidth="1"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" pointerEvents="none" />
              </g>
            )}

            {shapes.map((s) => {
              if (s.kind === 'circle') {
                return (
                  <circle
                    key={s.id}
                    cx={s.x}
                    cy={s.y}
                    r={s.r}
                    fill={s.color}
                    stroke={s.color.slice(0, 7)}
                    strokeWidth="2"
                    onDoubleClick={() => removeShape(s.id)}
                  />
                );
              }
              if (s.kind === 'square') {
                return (
                  <rect
                    key={s.id}
                    x={s.x}
                    y={s.y}
                    width={s.w}
                    height={s.h}
                    fill={s.color}
                    stroke={s.color.slice(0, 7)}
                    strokeWidth="2"
                    onDoubleClick={() => removeShape(s.id)}
                  />
                );
              }
              if (s.kind === 'cone') {
                const len = Math.hypot(s.dx, s.dy);
                const ux = s.dx / len;
                const uy = s.dy / len;
                const px = -uy;
                const py = ux;
                const half = len / 2;
                const tipX = s.x + s.dx;
                const tipY = s.y + s.dy;
                const leftX = tipX + px * half;
                const leftY = tipY + py * half;
                const rightX = tipX - px * half;
                const rightY = tipY - py * half;
                return (
                  <polygon
                    key={s.id}
                    points={`${s.x},${s.y} ${leftX},${leftY} ${rightX},${rightY}`}
                    fill={s.color}
                    stroke={s.color.slice(0, 7)}
                    strokeWidth="2"
                    onDoubleClick={() => removeShape(s.id)}
                  />
                );
              }
              return null;
            })}

            {ruler && tool === 'ruler' && (
              <g pointerEvents="none">
                <line
                  x1={ruler.x1}
                  y1={ruler.y1}
                  x2={ruler.x2}
                  y2={ruler.y2}
                  stroke="#fbbf24"
                  strokeWidth="2"
                  strokeDasharray="6 4"
                />
                <circle cx={ruler.x1} cy={ruler.y1} r="4" fill="#fbbf24" />
                <circle cx={ruler.x2} cy={ruler.y2} r="4" fill="#fbbf24" />
              </g>
            )}

            {tokens.map((t) => (
              <g
                key={t.id}
                style={{ cursor: 'grab' }}
                onMouseDown={(e) => {
                  if (tool !== 'select') return;
                  e.stopPropagation();
                  const p = getPoint(e);
                  setDraggingTokenId(t.id);
                  setDragOffset({ x: p.x - t.x, y: p.y - t.y });
                }}
                onDoubleClick={() => removeToken(t.id)}
              >
                <circle
                  cx={t.x}
                  cy={t.y}
                  r={t.size / 2}
                  fill={t.color}
                  stroke="#1c1917"
                  strokeWidth="2"
                />
                {t.emoji && (
                  <text
                    x={t.x}
                    y={t.y + t.size * 0.15}
                    textAnchor="middle"
                    fontSize={t.size * 0.55}
                    pointerEvents="none"
                  >
                    {t.emoji}
                  </text>
                )}
                <text
                  x={t.x}
                  y={t.y + t.size / 2 + 14}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#fafaf9"
                  stroke="#1c1917"
                  strokeWidth="3"
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  {t.name}
                </text>
              </g>
            ))}
          </svg>
          <div className="absolute bottom-3 left-3 text-[10px] text-slate-500 bg-slate-950/70 px-2 py-1 rounded">
            Double-click a token or shape to remove it · Grid cell = 5 ft
          </div>
        </div>
      </div>
    </div>
  );
}
