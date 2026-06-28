import { useState, useEffect, useCallback, useRef } from 'react';
import { COLS, ROWS, Cell, Pill, generateViruses, CellColor, checkCollision, findMatches } from './GameLogic';

type GameState = 'playing' | 'clearing' | 'gameover';

export function useDrMario(level: number = 1) {
  const [board, setBoard] = useState<Cell[][]>(() => generateViruses(level));
  const [currentPill, setCurrentPill] = useState<Pill | null>(null);
  const [gameState, setGameState] = useState<GameState>('playing');
  
  const boardRef = useRef(board);
  const pillRef = useRef(currentPill);
  const stateRef = useRef(gameState);

  useEffect(() => {
    boardRef.current = board;
    pillRef.current = currentPill;
    stateRef.current = gameState;
  }, [board, currentPill, gameState]);

  const spawnPill = useCallback(() => {
    const colors: CellColor[] = ['red', 'yellow', 'blue'];
    const randomColor = () => colors[Math.floor(Math.random() * colors.length)];
    
    const newPill: Pill = {
      pos: { r: 1, c: Math.floor(COLS / 2) - 1 },
      orientation: 'horizontal',
      color1: randomColor(),
      color2: randomColor()
    };

    if (checkCollision(boardRef.current, newPill, 0, 0)) {
      setGameState('gameover');
      setCurrentPill(null);
    } else {
      setCurrentPill(newPill);
      setGameState('playing');
    }
  }, []);

  const lockPill = useCallback((pill: Pill) => {
    const newBoard = boardRef.current.map(row => [...row]);
    
    // Lock primary
    if (pill.pos.r >= 0) {
      newBoard[pill.pos.r][pill.pos.c] = { color: pill.color1, isVirus: false, fixed: true };
    }
    // Lock secondary
    const r2 = pill.orientation === 'horizontal' ? pill.pos.r : pill.pos.r - 1;
    const c2 = pill.orientation === 'horizontal' ? pill.pos.c + 1 : pill.pos.c;
    if (r2 >= 0) {
      newBoard[r2][c2] = { color: pill.color2, isVirus: false, fixed: true };
    }
    
    setBoard(newBoard);
    setCurrentPill(null);
    setGameState('clearing');
  }, []);

  const applyGravity = useCallback((currentBoard: Cell[][]) => {
    let moved = false;
    const newBoard = currentBoard.map(row => [...row]);
    
    // Simple gravity: any non-virus block that has empty space below it falls down
    // Since pills split in Dr Mario MVP, we just let individual blocks fall.
    for (let c = 0; c < COLS; c++) {
      for (let r = ROWS - 2; r >= 0; r--) { // Start from bottom-1 up
        if (newBoard[r][c].color && !newBoard[r][c].isVirus) {
          // find how far down it can go
          let targetR = r;
          while (targetR + 1 < ROWS && !newBoard[targetR + 1][c].color) {
            targetR++;
          }
          if (targetR !== r) {
            newBoard[targetR][c] = newBoard[r][c];
            newBoard[r][c] = { color: null, isVirus: false, fixed: false };
            moved = true;
          }
        }
      }
    }
    return { newBoard, moved };
  }, []);

  const processMatches = useCallback(() => {
    const currentBoard = boardRef.current;
    const matches = findMatches(currentBoard);
    
    if (matches.length > 0) {
      const newBoard = currentBoard.map(row => [...row]);
      matches.forEach(({ r, c }) => {
        newBoard[r][c] = { color: null, isVirus: false, fixed: false };
      });
      setBoard(newBoard);
      
      // After clearing, apply gravity with a small delay
      setTimeout(() => {
        const { newBoard: gravBoard, moved } = applyGravity(newBoard);
        setBoard(gravBoard);
        // We stay in 'clearing' state, useEffect will trigger processMatches again
      }, 250);
    } else {
      // No more matches, spawn next pill
      setGameState('playing');
      spawnPill();
    }
  }, [applyGravity, spawnPill]);

  // Main clear loop
  useEffect(() => {
    if (gameState === 'clearing') {
      const timer = setTimeout(processMatches, 250);
      return () => clearTimeout(timer);
    }
  }, [gameState, board, processMatches]);

  const moveDown = useCallback(() => {
    if (stateRef.current !== 'playing') return;
    const pill = pillRef.current;
    if (!pill) return;
    
    if (checkCollision(boardRef.current, pill, 1, 0)) {
      lockPill(pill);
    } else {
      setCurrentPill({ ...pill, pos: { ...pill.pos, r: pill.pos.r + 1 } });
    }
  }, [lockPill]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (stateRef.current !== 'playing') return;
      const pill = pillRef.current;
      if (!pill) return;

      switch (e.key) {
        case 'ArrowLeft':
          if (!checkCollision(boardRef.current, pill, 0, -1)) {
            setCurrentPill({ ...pill, pos: { ...pill.pos, c: pill.pos.c - 1 } });
          }
          break;
        case 'ArrowRight':
          if (!checkCollision(boardRef.current, pill, 0, 1)) {
            setCurrentPill({ ...pill, pos: { ...pill.pos, c: pill.pos.c + 1 } });
          }
          break;
        case 'ArrowDown':
          moveDown();
          break;
        case 'ArrowUp':
          // Rotate
          const newOrientation = pill.orientation === 'horizontal' ? 'vertical' : 'horizontal';
          // When rotating, the primary block (pos) stays the same, secondary block moves.
          const testPill = { ...pill, orientation: newOrientation as any };
          if (!checkCollision(boardRef.current, testPill, 0, 0)) {
            setCurrentPill(testPill);
          } else {
            // Kick left/right logic could go here
            const kickLeft = { ...testPill, pos: { ...testPill.pos, c: testPill.pos.c - 1 } };
            if (!checkCollision(boardRef.current, kickLeft, 0, 0)) {
              setCurrentPill(kickLeft);
            }
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveDown]);

  // Gravity interval
  useEffect(() => {
    if (gameState === 'gameover' || gameState === 'clearing') return;
    if (!currentPill) {
      spawnPill();
      return;
    }
    const interval = setInterval(moveDown, 1000);
    return () => clearInterval(interval);
  }, [moveDown, gameState, currentPill, spawnPill]);

  return {
    board,
    currentPill,
    gameState
  };
}
