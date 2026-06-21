export type Spell = {
  index: string;
  name: string;
  desc: string[];
  higher_level?: string[];
  range: string;
  components: string[];
  material?: string;
  ritual: boolean;
  duration: string;
  concentration: boolean;
  casting_time: string;
  level: number;
  attack_type?: string;
  damage?: {
    damage_type?: { name: string };
    damage_at_slot_level?: Record<string, string>;
    damage_at_character_level?: Record<string, string>;
  };
  school: { name: string };
  classes?: { name: string }[];
  dc?: { dc_type?: { name: string }; dc_success?: string };
  area_of_effect?: { type: string; size: number };
};

export type EquipmentItem = {
  index: string;
  name: string;
  equipment_category: { name: string };
  gear_category?: { name: string };
  weapon_category?: string;
  weapon_range?: string;
  category_range?: string;
  armor_category?: string;
  armor_class?: { base: number; dex_bonus?: boolean; max_bonus?: number };
  str_minimum?: number;
  stealth_disadvantage?: boolean;
  cost?: { quantity: number; unit: string };
  damage?: { damage_dice: string; damage_type: { name: string } };
  two_handed_damage?: { damage_dice: string; damage_type: { name: string } };
  range?: { normal?: number; long?: number };
  weight?: number;
  properties?: { name: string }[];
  desc?: string[];
};

export type MagicItem = {
  index: string;
  name: string;
  equipment_category: { name: string };
  rarity: { name: string };
  desc: string[];
  variant?: boolean;
};

export type Monster = {
  index: string;
  name: string;
  size: string;
  type: string;
  subtype?: string;
  alignment: string;
  armor_class: { type: string; value: number }[];
  hit_points: number;
  hit_dice: string;
  hit_points_roll?: string;
  speed: Record<string, string>;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  proficiencies?: { value: number; proficiency: { name: string } }[];
  damage_vulnerabilities?: string[];
  damage_resistances?: string[];
  damage_immunities?: string[];
  condition_immunities?: { name: string }[];
  senses?: Record<string, string>;
  languages?: string;
  challenge_rating: number;
  proficiency_bonus?: number;
  xp: number;
  special_abilities?: { name: string; desc: string }[];
  actions?: { name: string; desc: string }[];
  legendary_actions?: { name: string; desc: string }[];
};

export type RuleSection = {
  index: string;
  name: string;
  desc: string;
};

/** One row of a class's level-progression table. `classColumns` keeps the
 *  class-specific columns (Rages, Sneak Attack, Spell Slots, etc.) as a
 *  preserved map so the UI can render them generically. */
export type ClassLevelRow = {
  level: number;
  proficiencyBonus: number;
  /** Feature names unlocked at this level (matches keys in `Class.features`). */
  features: string[];
  /** Remaining table columns from the class's level table, raw strings. */
  classColumns: Record<string, string>;
};

export type ClassSubclass = {
  index: string;
  name: string;
  className: string;
  /** Feature unlocks at specific levels. */
  features: { level: number; name: string; desc: string }[];
};

export type Class = {
  index: string;
  name: string;
  /** D-die size (6, 8, 10, 12). */
  hitDie: number;
  /** Free-text "Primary Ability" line from Core Traits — e.g. "Strength" or
   *  "Dexterity or Strength". */
  primaryAbility: string;
  /** Saving-throw proficiencies. */
  saveProfs: string;
  /** Free-text skill-choice line — e.g. "Choose 2: Animal Handling, …". */
  skillChoices: string;
  weaponProfs: string;
  armorProfs: string;
  /** Starting equipment string preserving the "Choose A or B" phrasing. */
  startingEquipment: string;
  /** 20 rows in level order. */
  levelTable: ClassLevelRow[];
  /** Feature name → markdown description body. */
  features: Record<string, string>;
  /** SRD 5.2 ships one subclass per class. */
  subclasses: ClassSubclass[];
  /** Spell list keyed by spell level (caster classes only). Each entry is a
   *  spell index slug matching Spells dataset. */
  spellList?: { level: number; spells: string[] }[];
};

export type Species = {
  index: string;
  name: string;
  creatureType: string;
  size: string;
  speed: string;
  /** Trait paragraphs (italic-prefixed in source). */
  traits: { name: string; desc: string }[];
};

export type Background = {
  index: string;
  name: string;
  abilityScores: string[];
  feat: string;
  skillProfs: string[];
  toolProf: string;
  equipment: string;
};

export type Feat = {
  index: string;
  name: string;
  category: 'Origin' | 'General' | 'Fighting Style' | 'Epic Boon';
  prerequisite?: string;
  desc: string;
  repeatable?: boolean;
};
