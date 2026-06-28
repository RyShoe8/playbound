import React from 'react';
import Link from 'next/link';

export default function ClassicHubArchive() {
  const games = [
    { slug: 'medal-of-honor-aa', title: 'Medal of Honor: Allied Assault', genre: 'FPS' },
    { slug: 'quake-3', title: 'Quake III Arena', genre: 'Arena Shooter' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
          Classic Game Hubs
        </h1>
        <p className="text-gray-400 mb-12 max-w-2xl">
          Find installation guides, community patches, and active server lists for legendary legacy multiplayer titles. 
          Keep the classics alive.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {games.map((g) => (
            <Link 
              key={g.slug} 
              href={`/classic/${g.slug}`}
              className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-emerald-500 transition-colors group"
            >
              <h2 className="text-2xl font-bold text-white group-hover:text-emerald-400 transition-colors">{g.title}</h2>
              <div className="mt-4 flex gap-2">
                <span className="px-2 py-1 bg-gray-800 text-xs rounded text-gray-300 uppercase tracking-wider">{g.genre}</span>
                <span className="px-2 py-1 bg-gray-800 text-xs rounded text-gray-300 uppercase tracking-wider">Guides</span>
                <span className="px-2 py-1 bg-gray-800 text-xs rounded text-gray-300 uppercase tracking-wider">Servers</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
