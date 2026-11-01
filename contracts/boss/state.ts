import type { z } from 'zod';
import type {
  dropSchema,
  runSchema,
  profileSchema,
  characterSchema,
  rosterSchema,
  bossStateSchema,
} from './schema';
export type Drop = z.infer<typeof dropSchema>;
export type Run = z.infer<typeof runSchema>;
export type CharacterProfile = z.infer<typeof profileSchema>;
export type Character = z.infer<typeof characterSchema>;
export type RosterChoice = z.infer<typeof rosterSchema>;
export type BossState = z.infer<typeof bossStateSchema>;
export interface BossDefinition {
  id: string;
  name: string;
  difficulty: string;
  period: 'week' | 'month';
  price: number;
  icon?: string;
}
export interface ItemDefinition {
  id: string;
  name: string;
  icon: string;
}
