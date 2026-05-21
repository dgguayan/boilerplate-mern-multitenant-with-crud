import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

const ROLE_COLORS = {
  superadmin: 'bg-red-100 text-red-700',
  admin: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  user: 'bg-gray-100 text-gray-600',
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/dashboard" className="font-semibold text-gray-900 text-lg">
            {user?.tenantName || 'App'}
          </Link>
          <Link to="/projects" className="text-sm text-gray-600 hover:text-gray-900">
            Projects
          </Link>
        </div>

        {user && (
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${ROLE_COLORS[user.role]}`}>
              {user.role}
            </span>
            <span className="text-sm text-gray-600">{user.name}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
