import { Navigate, useLocation } from "react-router-dom";
import { getAuthToken, getRoleHome, getStoredUser, getUserRole, isRoleAllowed } from "../services/auth";

function ProtectedRoute({ children, allowedRoles = [] }) {
  const location = useLocation();
  const user = getStoredUser();
  const token = getAuthToken();

  if (!user || !token) {
    return (
      <Navigate
        replace
        to="/login"
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }

  if (!isRoleAllowed(getUserRole(user), allowedRoles)) {
    return <Navigate replace to={getRoleHome(user)} />;
  }

  return children;
}

export default ProtectedRoute;
