import React from 'react';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    // For MVP, if not logged in, we'll just show a placeholder instead of hard redirecting, 
    // or we can redirect to login. Let's redirect to a mock login for now.
    // redirect('/api/auth/signin');
  }

  let stats = { gamesPlayed: 0, wins: 0, score: 0 };
  let username = session?.user?.name || 'Guest_Player';

  if (session?.user?.email) {
    await dbConnect();
    const dbUser = await User.findOne({ email: session.user.email }).lean();
    if (dbUser) {
      stats = dbUser.stats || stats;
      username = dbUser.username;
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Player Profile</h1>
        
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 flex flex-col md:flex-row gap-8 items-center md:items-start">
          <div className="w-32 h-32 bg-gray-800 rounded-full border-4 border-blue-500 flex items-center justify-center text-4xl font-bold text-gray-500">
            {username.charAt(0).toUpperCase()}
          </div>
          
          <div className="flex-1 text-center md:text-left">
            <h2 className="text-3xl font-bold">{username}</h2>
            <p className="text-gray-400 mt-2">{session?.user?.email || 'Anonymous Guest Account'}</p>
            
            <div className="grid grid-cols-3 gap-4 mt-8">
              <div className="bg-gray-800 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-blue-400">{stats.gamesPlayed}</div>
                <div className="text-sm text-gray-400 mt-1 uppercase tracking-wider">Games Played</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-emerald-400">{stats.wins}</div>
                <div className="text-sm text-gray-400 mt-1 uppercase tracking-wider">Wins</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-purple-400">{stats.score}</div>
                <div className="text-sm text-gray-400 mt-1 uppercase tracking-wider">Total Score</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-gray-900 border border-gray-800 rounded-2xl p-8">
          <h3 className="text-xl font-bold mb-4">Recent Matches</h3>
          <div className="text-center py-12 text-gray-500 border-2 border-dashed border-gray-800 rounded-xl">
            No recent matches found. Start playing to see your history!
          </div>
        </div>
      </div>
    </div>
  );
}
