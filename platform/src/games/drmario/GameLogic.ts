export const ROWS = 16;
export const COLS = 8;

export type CellColor = 'red' | 'yellow' | 'blue' | null;

export interface Cell {
  color: CellColor;
  isVirus: boolean;
  fixed: boolean;
}

export interface Position {
  r: number;
  c: number;
}

export interface Pill {
  pos: Position; // position of the primary half (left if horizontal, bottom if vertical)
  orientation: 'horizontal' | 'vertical';
  color1: CellColor; // primary
  color2: CellColor; // secondary (right if horizontal, top if vertical)
}

export function createEmptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ color: null, isVirus: false, fixed: false }))
  );
}

export function generateViruses(level: number): Cell[][] {
  const board = createEmptyBoard();
  const numViruses = Math.min(level * 4 + 4, 84); // Max 84 viruses
  const colors: CellColor[] = ['red', 'yellow', 'blue'];
  
  let placed = 0;
  while (placed < numViruses) {
    const r = Math.floor(Math.random() * (ROWS - 4)) + 4; // Viruses only in bottom 12 rows
    const c = Math.floor(Math.random() * COLS);
    
    if (!board[r][c].color) {
      board[r][c] = {
        color: colors[Math.floor(Math.random() * colors.length)],
        isVirus: true,
        fixed: true
      };
      placed++;
    }
  }
  return board;
}

export function checkCollision(board: Cell[][], pill: Pill, dR: number, dC: number): boolean {
  const nextR1 = pill.pos.r + dR;
  const nextC1 = pill.pos.c + dC;
  
  const nextR2 = pill.orientation === 'horizontal' ? nextR1 : nextR1 - 1;
  const nextC2 = pill.orientation === 'horizontal' ? nextC1 + 1 : nextC1;

  // Check bounds
  if (nextR1 >= ROWS || nextC1 < 0 || nextC1 >= COLS) return true;
  if (nextR2 >= ROWS || nextC2 < 0 || nextC2 >= COLS) return true;

  // Check board cells
  if (nextR1 >= 0 && board[nextR1][nextC1].color !== null) return true;
  if (nextR2 >= 0 && board[nextR2][nextC2].color !== null) return true;

  return false;
}

// Find matches of 4 or more
export function findMatches(board: Cell[][]): Position[] {
  const matches = new Set<string>();

  // Check horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS - 3; c++) {
      const color = board[r][c].color;
      if (!color) continue;
      if (
        board[r][c+1].color === color &&
        board[r][c+2].color === color &&
        board[r][c+3].color === color
      ) {
        matches.add(`${r},${c}`);
        matches.add(`${r},${c+1}`);
        matches.add(`${r},${c+2}`);
        matches.add(`${r},${c+3}`);
        // keep checking forward
        let nextC = c + 4;
        while (nextC < COLS && board[r][nextC].color === color) {
          matches.add(`${r},${nextC}`);
          nextC++;
        }
      }
    }
  }

  // Check vertical
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS - 3; r++) {
      const color = board[r][c].color;
      if (!color) continue;
      if (
        board[r+1][c].color === color &&
        board[r+2][c].color === color &&
        board[r+3][c].color === color
      ) {
        matches.add(`${r},${c}`);
        matches.add(`${r+1},${c}`);
        matches.add(`${r+2},${c}`);
        matches.add(`${r+3},${c}`);
        // keep checking forward
        let nextR = r + 4;
        while (nextR < ROWS && board[nextR][c].color === color) {
          matches.add(`${nextR},${c}`);
          nextR++;
        }
      }
    }
  }

  return Array.from(matches).map(str => {
    const [r, c] = str.split(',').map(Number);
    return { r, c };
  });
}
