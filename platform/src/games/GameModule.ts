export interface GameState {
  [key: string]: any;
}

export interface GameModule {
  gameId: string;
  createRoom(roomId: string, hostId: string, options?: any): void;
  joinRoom(roomId: string, playerId: string): void;
  leaveRoom(roomId: string, playerId: string): void;
  startGame(roomId: string): void;
  handleAction(roomId: string, playerId: string, action: any): void;
  getState(roomId: string): GameState | undefined;
  endGame(roomId: string): void;
}
