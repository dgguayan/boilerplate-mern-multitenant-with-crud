import { Link } from 'react-router-dom';

export default function Forbidden() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-5xl mb-4">🚫</p>
        <h1 className="text-2xl font-semibold text-gray-900">Access denied</h1>
        <p className="text-gray-500 mt-2">You don't have permission to view this page.</p>
        <Link to="/dashboard" className="mt-4 inline-block text-indigo-600 hover:underline text-sm">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
