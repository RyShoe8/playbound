import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-8">
      <main className="max-w-4xl w-full flex flex-col items-center gap-8 text-center">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
          Playbound.club
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl">
          Instantly play multiplayer browser games with friends. No downloads required.
        </p>
        
        <div className="flex gap-4 mt-8">
          <Link href="/games/dr-mario" className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)]">
            Play Dr. Mario (Alpha)
          </Link>
          <Link href="/classic" className="px-8 py-4 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-full transition-all">
            Classic Game Hub
          </Link>
        </div>

        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 w-full text-left">
          <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800">
            <h3 className="text-xl font-bold mb-3 text-blue-400">Instant Play</h3>
            <p className="text-gray-400">Jump right into a game with our guest accounts. No lengthy signups.</p>
          </div>
          <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800">
            <h3 className="text-xl font-bold mb-3 text-emerald-400">Game of the Week</h3>
            <p className="text-gray-400">Discover new curated games every Monday through our newsletter.</p>
          </div>
          <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800">
            <h3 className="text-xl font-bold mb-3 text-purple-400">Classic Hubs</h3>
            <p className="text-gray-400">Find guides and community servers for legendary legacy titles.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
