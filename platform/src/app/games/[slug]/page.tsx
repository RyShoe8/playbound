import React from 'react';
import DrMarioGame from '@/games/drmario';

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (slug === 'dr-mario') {
    return <DrMarioGame />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Game Not Found</h1>
        <p className="text-gray-400">The game &quot;{slug}&quot; could not be found or is not yet implemented.</p>
      </div>
    </div>
  );
}
