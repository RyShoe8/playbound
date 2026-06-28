"use client";

import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useDrMario } from './useDrMario';
import { COLS, ROWS, Cell } from './GameLogic';

export default function DrMarioGame() {
  const [mounted, setMounted] = useState(false);
  const { board, currentPill, gameState } = useDrMario(1);
  const [opponentBoard, setOpponentBoard] = useState<Cell[][] | null>(null);
  const [roomId, setRoomId] = useState('');
  const [joined, setJoined] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);

  // Prevent hydration mismatch
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const serverUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL || "http://localhost:3001";
    socketRef.current = io(serverUrl);
    
    socketRef.current.on('gameUpdate', ({ playerId, action }) => {
      // Very simple MVP sync: opponent sends their entire board state when it changes
      if (socketRef.current?.id !== playerId && action.type === 'BOARD_UPDATE') {
        setOpponentBoard(action.board);
      }
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  // Broadcast our board state when it changes (simplified sync)
  useEffect(() => {
    if (joined && socketRef.current && (gameState === 'clearing' || gameState === 'playing')) {
      socketRef.current.emit('gameAction', {
        roomId,
        playerId: socketRef.current.id,
        action: { type: 'BOARD_UPDATE', board }
      });
    }
  }, [board, joined, roomId, gameState]);

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId) return;
    socketRef.current?.emit('joinRoom', { roomId, userId: socketRef.current.id });
    setJoined(true);
  };

  if (!mounted) return null;

  const getCellColorClass = (color: string | null) => {
    switch (color) {
      case 'red': return 'bg-red-500 border-red-700';
      case 'yellow': return 'bg-yellow-400 border-yellow-600';
      case 'blue': return 'bg-blue-500 border-blue-700';
      default: return 'bg-transparent border-transparent';
    }
  };

  const renderBoard = (renderBoard: Cell[][], isOpponent = false) => (
    <div 
      className={`relative bg-gray-900 border-4 border-gray-700 rounded-lg overflow-hidden ${!isOpponent && 'shadow-2xl shadow-blue-900/20'}`}
      style={{
        width: COLS * 32,
        height: ROWS * 32,
        opacity: isOpponent ? 0.8 : 1
      }}
    >
      {/* Render static board cells */}
      {renderBoard.map((row, r) => 
        row.map((cell, c) => (
          cell.color && (
            <div 
              key={`${r}-${c}`}
              className={`absolute border-2 rounded-sm flex items-center justify-center ${getCellColorClass(cell.color)}`}
              style={{
                top: r * 32,
                left: c * 32,
                width: 32,
                height: 32,
              }}
            >
              {cell.isVirus && (
                <div className="w-4 h-4 bg-black/40 rounded-full" />
              )}
            </div>
          )
        ))
      )}

      {/* Render falling pill for player only */}
      {!isOpponent && currentPill && gameState === 'playing' && (
        <>
          <div 
            className={`absolute border-2 rounded-full ${getCellColorClass(currentPill.color1)}`}
            style={{
              top: currentPill.pos.r * 32,
              left: currentPill.pos.c * 32,
              width: 32,
              height: 32,
            }}
          />
          <div 
            className={`absolute border-2 rounded-full ${getCellColorClass(currentPill.color2)}`}
            style={{
              top: currentPill.orientation === 'horizontal' ? currentPill.pos.r * 32 : (currentPill.pos.r - 1) * 32,
              left: currentPill.orientation === 'horizontal' ? (currentPill.pos.c + 1) * 32 : currentPill.pos.c * 32,
              width: 32,
              height: 32,
            }}
          />
        </>
      )}

      {!isOpponent && gameState === 'gameover' && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center p-4 text-center z-10">
          <h2 className="text-2xl font-bold text-red-500 mb-2">GAME OVER</h2>
          <button 
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded"
            onClick={() => window.location.reload()}
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-950 p-4 pt-12">
      <h1 className="text-3xl font-bold text-white mb-6">Playbound - Dr. Mario (Multiplayer MVP)</h1>
      
      {!joined && (
        <form onSubmit={joinRoom} className="mb-8 flex gap-2">
          <input 
            type="text" 
            placeholder="Enter Room Code" 
            className="px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded"
            value={roomId}
            onChange={e => setRoomId(e.target.value)}
            required
          />
          <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded">
            Join Room
          </button>
        </form>
      )}

      <div className="flex gap-12 items-start justify-center flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-center text-blue-400 mb-2">You</h2>
          {renderBoard(board)}
        </div>

        {joined && (
          <div>
            <h2 className="text-xl font-bold text-center text-red-400 mb-2">Opponent</h2>
            {opponentBoard ? (
              renderBoard(opponentBoard, true)
            ) : (
              <div 
                className="bg-gray-900 border-4 border-gray-800 rounded-lg flex items-center justify-center"
                style={{ width: COLS * 32, height: ROWS * 32 }}
              >
                <p className="text-gray-500 text-center px-4">Waiting for opponent to join and send board state...</p>
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="text-gray-400 max-w-xs p-6 bg-gray-900 border border-gray-800 rounded-xl hidden xl:block">
          <h3 className="text-xl font-bold text-white mb-4">Controls</h3>
          <ul className="space-y-3">
            <li><kbd className="px-2 py-1 bg-gray-800 rounded text-sm text-gray-200">←</kbd> <kbd className="px-2 py-1 bg-gray-800 rounded text-sm text-gray-200">→</kbd> Move</li>
            <li><kbd className="px-2 py-1 bg-gray-800 rounded text-sm text-gray-200">↑</kbd> Rotate</li>
            <li><kbd className="px-2 py-1 bg-gray-800 rounded text-sm text-gray-200">↓</kbd> Drop</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
