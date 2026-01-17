
export enum GameState {
  START = 'START',
  WORKING = 'WORKING',
  CHOOSE_JOB = 'CHOOSE_JOB',
  END = 'END'
}

export interface Upgrade {
  id: string;
  name: string;
  cost: number;
  bonusClick?: number;
  bonusSec?: number;
}

export interface Job {
  id: number;
  name: string;
  icon: string;
  baseClick: number;
  baseSec: number;
  upgrades: Upgrade[];
  minMoneyToResign: number; // For progression gating
}

export interface PlayerState {
  money: number;
  totalMoneyEarned: number;
  currentJobIndex: number;
  purchasedUpgrades: string[];
  unlockedJobs: number[];
  lastSpinTime: number; // Timestamp of the last roulette spin
}
