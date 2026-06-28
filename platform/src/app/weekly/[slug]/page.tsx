import React from 'react';
import Link from 'next/link';

export default async function WeeklyFeaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <Link href="/weekly" className="text-purple-400 hover:text-purple-300 mb-8 inline-block">&larr; Back to Archive</Link>
        
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 md:p-12">
          <div className="inline-block px-3 py-1 bg-purple-900/50 text-purple-300 text-sm font-bold rounded-full mb-4">
            Game of the Week
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4 capitalize">
            {slug.replace(/-/g, ' ')}
          </h1>
          <p className="text-gray-400 text-lg mb-8">
            This week we dive into a hidden gem. Here is why you should check it out.
          </p>

          <div className="prose prose-invert prose-purple max-w-none">
            <p>
              (MVP Placeholder Content for {slug}). In a fully populated database, this content would be pulled from the `WeeklyFeature` collection via Mongoose, and would include rich text, images, and gameplay videos.
            </p>
            <h3>Why we love it</h3>
            <ul>
              <li>Amazing pixel art aesthetics</li>
              <li>Tight controls and fast-paced loop</li>
              <li>Great multiplayer integration</li>
            </ul>
          </div>
          
          <div className="mt-12 pt-8 border-t border-gray-800">
            <button className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors">
              Play Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
