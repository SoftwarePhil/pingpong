import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold text-gray-900 mb-4">🏓</h1>
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Ping Pong Tracker
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Track games, manage players, and organize tournaments for your weekly
            ping pong battles
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <Link href="/players" className="group">
            <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 border border-gray-200">
              <div className="text-4xl mb-4">👥</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors">
                Players
              </h3>
              <p className="text-gray-600">Manage your ping pong players</p>
            </div>
          </Link>

          <Link href="/games" className="group">
            <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 border border-gray-200">
              <div className="text-4xl mb-4">🎯</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors">
                Games
              </h3>
              <p className="text-gray-600">Record and view game results</p>
            </div>
          </Link>

          <Link href="/tournaments" className="group">
            <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 border border-gray-200">
              <div className="text-4xl mb-4">🏆</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors">
                Tournaments
              </h3>
              <p className="text-gray-600">Organize weekly tournaments</p>
            </div>
          </Link>

          <Link href="/stats" className="group">
            <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 border border-gray-200">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors">
                Stats
              </h3>
              <p className="text-gray-600">View player statistics</p>
            </div>
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Welcome to Ping Pong Tracker!
          </h2>
          <p className="text-gray-600 mb-6 text-lg">
            Keep track of your weekly ping pong games with our comprehensive
            tournament system. From round-robin play to single-elimination
            brackets, we&apos;ve got you covered.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                🏆 Tournament Features
              </h3>
              <ul className="space-y-2 text-gray-600">
                <li>• Round-robin stage with customizable rounds</li>
                <li>• Single-elimination bracket with best-of games</li>
                <li>• Automatic winner detection and progression</li>
                <li>• Real-time match updates</li>
              </ul>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                📈 Statistics & Tracking
              </h3>
              <ul className="space-y-2 text-gray-600">
                <li>• Individual game score tracking</li>
                <li>• Player win/loss statistics</li>
                <li>• Tournament standings</li>
                <li>• Historical game data</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
