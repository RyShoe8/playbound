import React from 'react';
import Link from 'next/link';

export default async function ClassicHubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/classic" className="text-emerald-400 hover:text-emerald-300 mb-8 inline-block">&larr; Back to Hubs</Link>
        
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 md:p-12">
          <div className="flex flex-col md:flex-row gap-8 items-start mb-12">
            <div className="w-full md:w-48 h-64 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center text-gray-500">
              [Box Art]
            </div>
            <div className="flex-1">
              <h1 className="text-4xl md:text-5xl font-extrabold mb-4 capitalize">
                {slug.replace(/-/g, ' ')}
              </h1>
              <div className="flex gap-2 mb-6">
                <span className="px-3 py-1 bg-gray-800 text-sm rounded text-gray-300 uppercase tracking-wider">Multiplayer</span>
                <span className="px-3 py-1 bg-gray-800 text-sm rounded text-gray-300 uppercase tracking-wider">Classic</span>
              </div>
              <p className="text-gray-400 text-lg">
                (MVP Placeholder Content for {slug}). A WWII shooter that defined a generation. Here you can find all the resources needed to get it running on modern systems and connect to active community servers.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <section>
                <h2 className="text-2xl font-bold mb-4 text-emerald-400 border-b border-gray-800 pb-2">Installation Guide</h2>
                <div className="prose prose-invert max-w-none">
                  <ol>
                    <li>Download the game from a legal source (e.g. GOG).</li>
                    <li>Install the game to `C:\Games\` (avoid Program Files to prevent permission issues).</li>
                    <li>Download the community revival patch.</li>
                    <li>Extract the patch contents into your game directory and overwrite existing files.</li>
                  </ol>
                  <div className="bg-gray-800/50 border border-gray-700 p-4 rounded-lg mt-4 text-sm text-gray-400">
                    <strong>Disclaimer:</strong> Check copyright status. We link only to legal downloads or community patches. If you own the game on Steam/GOG, feel free to download it from there.
                  </div>
                </div>
              </section>
              
              <section>
                <h2 className="text-2xl font-bold mb-4 text-emerald-400 border-b border-gray-800 pb-2">Compatibility Notes</h2>
                <ul className="list-disc list-inside text-gray-300 space-y-2">
                  <li>Windows 10/11 requires compatibility mode (Windows XP SP3).</li>
                  <li>For widescreen support, edit `config.cfg` and set `seta r_customwidth "1920"` and `seta r_customheight "1080"`.</li>
                </ul>
              </section>
            </div>
            
            <div>
              <h2 className="text-2xl font-bold mb-4 text-emerald-400 border-b border-gray-800 pb-2">Active Servers</h2>
              <div className="space-y-4 mt-6">
                {/* Mock Server List */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-white text-sm">EU Highscore 24/7</h3>
                    <span className="text-xs text-emerald-400 font-mono">12/32</span>
                  </div>
                  <div className="text-xs text-gray-400 font-mono bg-black/30 p-2 rounded">
                    connect 123.45.67.89:22222
                  </div>
                </div>
                
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-white text-sm">US East - Custom Maps</h3>
                    <span className="text-xs text-emerald-400 font-mono">8/16</span>
                  </div>
                  <div className="text-xs text-gray-400 font-mono bg-black/30 p-2 rounded">
                    connect 98.76.54.32:28960
                  </div>
                </div>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
