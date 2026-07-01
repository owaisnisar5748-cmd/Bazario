const USER_KEY = "bazarioUser";
const TOKEN_KEY = "authToken";
const SENSITIVE_USER_FIELDS = ["cardNumber", "cvv", "expiry", "upi"];
const DEFAULT_ROLE = "customer";

const ROLE_HOME = {
  admin: "/admin-dashboard",
  customer: "/",
  seller: "/seller-dashboard",
};

const ROLE_RESTRICTED_ROUTES = [
  { path: "/admin-dashboard", roles: ["admin"] },
  { path: "/seller-dashboard", roles: ["seller"] },
  { path: "/seller-onboarding", roles: ["seller"] },
  { path: "/seller-orders", roles: ["seller"] },
  { path: "/cart", roles: ["customer"] },
  { path: "/checkout", roles: ["customer"] },
  { path: "/my-orders", roles: ["customer"] },
  { path: "/notifications", roles: ["admin", "customer", "seller"] },
  { path: "/support", roles: ["admin", "customer", "seller"] },
];

function sanitizeUser(user) {
  if (!user || typeof user !== "object") return user;

  const safeUser = {
    ...user,
    role: normalizeRole(user.role),
  };
  SENSITIVE_USER_FIELDS.forEach((field) => delete safeUser[field]);
  return safeUser;
}

export function normalizeRole(role) {
  const normalizedRole = String(role || DEFAULT_ROLE).trim().toLowerCase();
  return ["admin", "customer", "seller"].includes(normalizedRole) ? normalizedRole : DEFAULT_ROLE;
}

export function getUserRole(user) {
  return normalizeRole(user?.role);
}

export function getRoleHome(userOrRole) {
  const role = typeof userOrRole === "string" ? normalizeRole(userOrRole) : getUserRole(userOrRole);
  return ROLE_HOME[role] || ROLE_HOME.customer;
}

export function isRoleAllowed(role, allowedRoles = []) {
  if (!allowedRoles.length) return true;
  return allowedRoles.map(normalizeRole).includes(normalizeRole(role));
}

export function getSafeRedirectPath(user, requestedPath) {
  const role = getUserRole(user);
  const fallbackPath = getRoleHome(role);

  if (!requestedPath || requestedPath === "/login" || requestedPath === "/register") {
    return fallbackPath;
  }

  const routeRule = ROLE_RESTRICTED_ROUTES.find((rule) => requestedPath.startsWith(rule.path));
  if (routeRule && !isRoleAllowed(role, routeRule.roles)) {
    return fallbackPath;
  }

  return requestedPath;
}

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return !payload.exp || payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export function getStoredUser() {
  const stored = localStorage.getItem(USER_KEY);

  if (!stored) return null;

  try {
    const user = JSON.parse(stored);
    const safeUser = sanitizeUser(user);

    if (SENSITIVE_USER_FIELDS.some((field) => field in user)) {
      localStorage.setItem(USER_KEY, JSON.stringify(safeUser));
    }

    return safeUser;
  } catch {
    return null;
  }
}

export function getAuthToken() {
  const token = localStorage.getItem(TOKEN_KEY);

  if (token && isTokenExpired(token)) {
    clearSession();
    return null;
  }

  return token;
}

export function storeSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(sanitizeUser(user)));
}

export function updateStoredUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(sanitizeUser(user)));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem("user");
  localStorage.removeItem("loggedUser");
  localStorage.removeItem("token");
}
