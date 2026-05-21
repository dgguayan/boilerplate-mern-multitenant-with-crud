import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

export default function ProtectedRoute({ children, requiredRole = null }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole) {
    const hierarchy = { superadmin: 4, admin: 3, manager: 2, user: 1 };
    const userLevel = hierarchy[user.role] || 0;
    const required = hierarchy[requiredRole] || 0;
    if (userLevel < required) {
      return <Navigate to="/forbidden" replace />;
    }
  }

  return children;
}
