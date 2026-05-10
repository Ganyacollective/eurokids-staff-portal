import { login } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-eurokids-paper p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-eurokids-orange flex items-center justify-center text-white font-bold">
            E
          </div>
          <div>
            <h1 className="text-lg font-semibold text-eurokids-ink">Staff Portal</h1>
            <p className="text-xs text-gray-500">Eurokids JM Enclave</p>
          </div>
        </div>

        <form action={login} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Phone or Email
            </label>
            <input
              name="identifier"
              type="text"
              required
              placeholder="9876543210 or you@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-eurokids-blue/40 focus:border-eurokids-blue text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Password
            </label>
            <input
              name="password"
              type="password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-eurokids-blue/40 focus:border-eurokids-blue text-sm"
            />
          </div>
          <LoginError searchParams={searchParams} />
          <button
            type="submit"
            className="w-full bg-eurokids-orange hover:bg-eurokids-orange/90 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            Sign in
          </button>
        </form>

        <p className="text-xs text-gray-500 mt-6 text-center">
          Forgot your password? Ask the admin to reset it from the Supabase dashboard.
        </p>
      </div>
    </div>
  );
}

async function LoginError({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  if (!params.error) return null;
  return (
    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      {decodeURIComponent(params.error)}
    </div>
  );
}
