import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

const ROLE_INFO = {
  superadmin: { label: 'Super Admin', desc: 'Full system access across all tenants', color: 'text-red-600 bg-red-50 border-red-200' },
  admin: { label: 'Admin', desc: 'Manage users and settings within your tenant', color: 'text-purple-600 bg-purple-50 border-purple-200' },
  manager: { label: 'Manager', desc: 'Create and manage all projects in your tenant', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  user: { label: 'User', desc: 'View and manage your own projects', color: 'text-gray-600 bg-gray-50 border-gray-200' },
};

export default function Dashboard() {
  const { user, can } = useAuth();
  const role = ROLE_INFO[user?.role] || ROLE_INFO.user;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Welcome back, {user?.name} 👋</h1>
        <p className="text-gray-500 mt-1">{user?.tenantName} workspace</p>
      </div>

      <div className={`border rounded-xl p-5 mb-8 ${role.color}`}>
        <p className="font-medium text-sm">{role.label}</p>
        <p className="text-sm mt-0.5 opacity-80">{role.desc}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          to="/projects"
          className="block bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-sm transition-all"
        >
          <div className="text-2xl mb-3">📋</div>
          <h3 className="font-medium text-gray-900">Projects</h3>
          <p className="text-sm text-gray-500 mt-1">
            {can('create_project') ? 'Create and manage projects' : 'View your projects'}
          </p>
        </Link>

        {can('manage_users') && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 opacity-60 cursor-not-allowed">
            <div className="text-2xl mb-3">👥</div>
            <h3 className="font-medium text-gray-900">Users</h3>
            <p className="text-sm text-gray-500 mt-1">Coming soon</p>
          </div>
        )}

        {can('manage_tenants') && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 opacity-60 cursor-not-allowed">
            <div className="text-2xl mb-3">🏢</div>
            <h3 className="font-medium text-gray-900">Tenants</h3>
            <p className="text-sm text-gray-500 mt-1">Coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
}
