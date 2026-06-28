import Link from 'next/link';
import React from 'react';
import dbConnect from '@/lib/db';
import Game from '@/lib/models/Game';

export const dynamic = 'force-dynamic';

export default async function GamesCatalog() {
  await dbConnect();
  
  // Create a placeholder game if none exist in DB for MVP
  const count = await Game.countDocuments();
  if (count === 0) {
    await Game.create({
      title: "Dr. Mario",
      slug: "dr-mario",
      type: "browser",
      featured: true
    });
  }

  const games = await Game.find({ type: "browser" }).lean();

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
          Browser Games Catalog
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {games.map((game: any) => (
            <Link 
              key={game._id.toString()} 
              href={`/games/${game.slug}`}
              className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-blue-500 transition-colors group cursor-pointer block"
            >
              <h2 className="text-2xl font-bold text-white group-hover:text-blue-400 transition-colors">{game.title}</h2>
              <div className="mt-4 flex gap-2">
                <span className="px-2 py-1 bg-gray-800 text-xs rounded text-gray-300 uppercase tracking-wider">{game.type}</span>
                {game.featured && (
                  <span className="px-2 py-1 bg-emerald-900 text-emerald-300 text-xs rounded uppercase tracking-wider">Featured</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
