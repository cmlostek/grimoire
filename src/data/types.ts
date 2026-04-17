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
