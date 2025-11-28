
export interface CardType {
  id: string;
  content: string; // Emoji or Text
  isFlipped: boolean;
  isMatched: boolean;
  color: string; // Background color for visual variety
}

export enum GameMode {
  SOLO = 'SOLO',
  LOCAL_PVP = 'LOCAL_PVP',
  VS_AI = 'VS_AI',
  ONLINE_PVP = 'ONLINE_PVP'
}

export interface Player {
  id: number;
  name: string;
  score: number;
  color: string;
  isAi?: boolean;
  isLocal?: boolean; // For Online PvP to identify 'me'
}

export enum GameStatus {
  LOBBY = 'LOBBY',
  GENERATING = 'GENERATING',
  WAITING_FOR_PLAYER = 'WAITING_FOR_PLAYER', // New status for online
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER'
}

export interface GameState {
  status: GameStatus;
  mode: GameMode;
  deckTheme: string;
  turnCount: number;
  currentPlayerIndex: number;
  winner: Player | null | 'DRAW';
  roomId?: string; // For online
  region?: string; // For online
}

export interface ThemeResponse {
  items: string[];
  backgroundColorPalette: string[];
}
