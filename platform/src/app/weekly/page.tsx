import React from 'react';
import Link from 'next/link';

export default function WeeklyArchive() {
  // Stubbed static data for MVP
  const weeks = [
    { slug: 'space-pirates-adventure', title: 'Space Pirates Adventure', week: 27, year: 2026 },
    { slug: 'pixel-racer-z', title: 'Pixel Racer Z', week: 26, year: 2026 },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
          Game of the Week Archive
        </h1>
        
        <div className="flex flex-col gap-4">
          {weeks.map((w) => (
            <Link 
              key={w.slug} 
              href={`/weekly/${w.slug}`}
              className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-purple-500 transition-colors flex justify-between items-center group"
            >
              <div>
                <h2 className="text-xl font-bold text-white group-hover:text-purple-400 transition-colors">{w.title}</h2>
                <p className="text-gray-400 mt-1">Week {w.week}, {w.year}</p>
              </div>
              <span className="text-purple-500">Read &rarr;</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
