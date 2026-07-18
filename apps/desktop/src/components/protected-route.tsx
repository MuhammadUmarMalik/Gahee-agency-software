import { Navigate } from "react-router-dom";
import type { PermissionCode, RoleCode } from "@oil-agency/shared";
import { useAuthStore } from "@/stores/auth-store";

interface ProtectedRouteProps {
  children: React.ReactNode;
  permission?: PermissionCode;
  roles?: RoleCode[];
}

export function ProtectedRoute({ children, permission, roles }: ProtectedRouteProps) {
  const user = useAuthStore((state) => state.user);
  if (!user) return <Navigate to="/login" replace/>;
  if (permission && !user.permissions.includes(permission)) return <Navigate to="/" replace/>;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace/>;
  return children;
}
