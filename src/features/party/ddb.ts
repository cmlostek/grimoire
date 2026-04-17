import type { PartyMember } from '../../store';

type Raw = any;

const STAT_IDS: Record<number, 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'> = {
  1: 'str',
  2: 'dex',
  3: 'con',
  4: 'int',
  5: 'wis',
  6: 'cha',
};

function mod(score: number) {
  return Math.floor((score - 10) / 2);
}

function abilityScore(raw: Raw, id: number, abbr: string): number {
  const base = raw.stats?.find((s: Raw) => s.id === id)?.value ?? 10;
  const over = raw.overrideStats?.find((s: Raw) => s.id === id)?.value;
  const bonuses = collectBonuses(raw, 'set', `${abbr.toLowerCase()}-score`);
  if (over !== null && over !== undefined) return over + sumByType(raw, 'bonus', `${abbr.toLowerCase()}-score`);
  const bonus = collectBonuses(raw, 'bonus', `${abbr.toLowerCase()}-score`).reduce((s, m) => s + (m.value ?? 0), 0);
  return (bonuses[0]?.value ?? base) + bonus;
}

function collectBonuses(raw: Raw, type: string, subType: string): Raw[] {
  const out: Raw[] = [];
  const buckets = [
    raw.modifiers?.race,
    raw.modifiers?.class,
    raw.modifiers?.background,
    raw.modifiers?.item,
    raw.modifiers?.feat,
    raw.modifiers?.condition,
  ];
  for (const b of buckets) {
    if (!Array.isArray(b)) continue;
    for (const m of b) {
      if (m?.type === type && m?.subType === subType) out.push(m);
    }
  }
  return out;
}

function sumByType(raw: Raw, type: string, subType: string): number {
  return collectBonuses(raw, type, subType).reduce((s, m) => s + (m.value ?? 0), 0);
}

function classSummary(raw: Raw): { label: string; totalLevel: number } {
  const classes = raw.classes ?? [];
  const parts = classes.map((c: Raw) => {
    const name = c?.definition?.name ?? c?.subclassDefinition?.className ?? '';
    const sub = c?.subclassDefinition?.name;
    const lvl = c?.level ?? 0;
    return sub ? `${name} (${sub}) ${lvl}` : `${name} ${lvl}`;
  });
  const totalLevel = classes.reduce((s: number, c: Raw) => s + (c?.level ?? 0), 0);
  return { label: parts.join(' / ') || 'Unknown', totalLevel };
}

function raceName(raw: Raw): string {
  const base = raw.race?.fullName || raw.race?.baseName || raw.race?.name || '';
  return base;
}

function hpFromRaw(raw: Raw): { current: number; max: number; temp: number } {
  const base = raw.baseHitPoints ?? 0;
  const bonus = raw.bonusHitPoints ?? 0;
  const override = raw.overrideHitPoints;
  const removed = raw.removedHitPoints ?? 0;
  const temp = raw.temporaryHitPoints ?? 0;
  const max = override ?? base + bonus;
  const current = Math.max(0, max - removed);
  return { current, max, temp };
}

function proficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

function skillBonus(raw: Raw, statAbbr: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', skillKey: string, level: number): number {
  const statVal = abilityScore(raw, { str: 1, dex: 2, con: 3, int: 4, wis: 5, cha: 6 }[statAbbr], statAbbr);
  const abilityMod = mod(statVal);
  const pb = proficiencyBonus(level);
  const proficient = collectBonuses(raw, 'proficiency', skillKey).length > 0;
  const expertise = collectBonuses(raw, 'expertise', skillKey).length > 0;
  const bonusFromMods = sumByType(raw, 'bonus', skillKey);
  let skill = abilityMod + bonusFromMods;
  if (expertise) skill += pb * 2;
  else if (proficient) skill += pb;
  return skill;
}

function saveBonuses(raw: Raw, level: number): string {
  const pb = proficiencyBonus(level);
  const abilities: Array<[string, 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha']> = [
    ['STR', 'str'],
    ['DEX', 'dex'],
    ['CON', 'con'],
    ['INT', 'int'],
    ['WIS', 'wis'],
    ['CHA', 'cha'],
  ];
  return abilities
    .map(([label, key]) => {
      const score = abilityScore(raw, { str: 1, dex: 2, con: 3, int: 4, wis: 5, cha: 6 }[key], key);
      const m = mod(score);
      const proficient = collectBonuses(raw, 'proficiency', `${key}-saving-throws`).length > 0;
      const b = m + (proficient ? pb : 0);
      return `${label} ${b >= 0 ? '+' : ''}${b}`;
    })
    .join(', ');
}

function acFromRaw(raw: Raw): number {
  const dexMod = mod(abilityScore(raw, 2, 'dex'));
  const override = raw.overrideArmorClass;
  if (override) return override;
  const armor = (raw.inventory ?? []).find(
    (i: Raw) => i?.equipped && i?.definition?.filterType === 'Armor'
  );
  if (armor) {
    const armorType = armor.definition.type;
    const ac = armor.definition.armorClass ?? 10;
    if (armorType === 'Heavy Armor') return ac;
    if (armorType === 'Medium Armor') return ac + Math.min(2, dexMod);
    if (armorType === 'Light Armor') return ac + dexMod;
  }
  const unarmored = sumByType(raw, 'bonus', 'unarmored-armor-class');
  return 10 + dexMod + unarmored;
}

function speedFromRaw(raw: Raw): string {
  const base = raw.race?.weightSpeeds?.normal?.walk ?? 30;
  const climb = raw.race?.weightSpeeds?.normal?.climb;
  const fly = raw.race?.weightSpeeds?.normal?.fly;
  const swim = raw.race?.weightSpeeds?.normal?.swim;
  const parts = [`${base} ft.`];
  if (fly) parts.push(`fly ${fly} ft.`);
  if (climb) parts.push(`climb ${climb} ft.`);
  if (swim) parts.push(`swim ${swim} ft.`);
  return parts.join(', ');
}

export function isLikelyDdb(raw: any): boolean {
  if (!raw || typeof raw !== 'object') return false;
  return (
    'classes' in raw &&
    'stats' in raw &&
    Array.isArray(raw.classes) &&
    Array.isArray(raw.stats)
  );
}

export function isDdbWrapper(raw: any): boolean {
  return raw && typeof raw === 'object' && raw.success === true && raw.data && isLikelyDdb(raw.data);
}

export function parseDdb(input: any): Omit<PartyMember, 'id'> {
  const raw: Raw = isDdbWrapper(input) ? input.data : input;
  const { label: classLabel, totalLevel } = classSummary(raw);
  const hp = hpFromRaw(raw);
  const dexScore = abilityScore(raw, 2, 'dex');
  const wisScore = abilityScore(raw, 5, 'wis');
  const intScore = abilityScore(raw, 4, 'int');
  const perception = 10 + skillBonus(raw, 'wis', 'perception', totalLevel);
  const investigation = 10 + skillBonus(raw, 'int', 'investigation', totalLevel);
  const insight = 10 + skillBonus(raw, 'wis', 'insight', totalLevel);

  const skillProfs: string[] = [];
  const skillMap: Array<[string, 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha']> = [
    ['acrobatics', 'dex'],
    ['animal-handling', 'wis'],
    ['arcana', 'int'],
    ['athletics', 'str'],
    ['deception', 'cha'],
    ['history', 'int'],
    ['insight', 'wis'],
    ['intimidation', 'cha'],
    ['investigation', 'int'],
    ['medicine', 'wis'],
    ['nature', 'int'],
    ['perception', 'wis'],
    ['performance', 'cha'],
    ['persuasion', 'cha'],
    ['religion', 'int'],
    ['sleight-of-hand', 'dex'],
    ['stealth', 'dex'],
    ['survival', 'wis'],
  ];
  for (const [k, a] of skillMap) {
    if (collectBonuses(raw, 'proficiency', k).length > 0) {
      const bonus = skillBonus(raw, a, k, totalLevel);
      const name = k
        .split('-')
        .map((s) => s[0].toUpperCase() + s.slice(1))
        .join(' ');
      skillProfs.push(`${name} ${bonus >= 0 ? '+' : ''}${bonus}`);
    }
  }

  const languages = collectBonuses(raw, 'language', '')
    .map((m) => m.friendlySubtypeName || m.subType)
    .filter(Boolean)
    .join(', ');

  return {
    name: raw.name ?? 'Unnamed',
    player: raw.userName ?? raw.playerName ?? undefined,
    race: raceName(raw),
    classSummary: classLabel,
    level: totalLevel,
    ac: acFromRaw(raw),
    hp: hp.current,
    maxHp: hp.max,
    tempHp: hp.temp,
    speed: speedFromRaw(raw),
    initiativeBonus: mod(dexScore) + sumByType(raw, 'bonus', 'initiative'),
    passivePerception: perception,
    passiveInvestigation: investigation,
    passiveInsight: insight,
    str: abilityScore(raw, 1, 'str'),
    dex: dexScore,
    con: abilityScore(raw, 3, 'con'),
    int: intScore,
    wis: wisScore,
    cha: abilityScore(raw, 6, 'cha'),
    saves: saveBonuses(raw, totalLevel),
    skills: skillProfs.join(', '),
    languages: languages || '—',
    ddbUrl: raw.id ? `https://www.dndbeyond.com/characters/${raw.id}` : undefined,
    source: 'ddb-json',
  };
}

export function parseGenericJson(input: any): Omit<PartyMember, 'id'> {
  return {
    name: input.name ?? 'Unnamed',
    player: input.player,
    race: input.race ?? '',
    classSummary: input.classSummary ?? input.class ?? '',
    level: input.level ?? 1,
    ac: input.ac ?? 10,
    hp: input.hp ?? 0,
    maxHp: input.maxHp ?? input.hp ?? 0,
    tempHp: input.tempHp ?? 0,
    speed: input.speed ?? '30 ft.',
    initiativeBonus: input.initiativeBonus ?? 0,
    passivePerception: input.passivePerception ?? 10,
    passiveInvestigation: input.passiveInvestigation ?? 10,
    passiveInsight: input.passiveInsight ?? 10,
    str: input.str ?? 10,
    dex: input.dex ?? 10,
    con: input.con ?? 10,
    int: input.int ?? 10,
    wis: input.wis ?? 10,
    cha: input.cha ?? 10,
    saves: input.saves ?? '',
    skills: input.skills ?? '',
    languages: input.languages ?? '—',
    ddbUrl: input.ddbUrl,
    notes: input.notes,
    source: 'json',
  };
}
