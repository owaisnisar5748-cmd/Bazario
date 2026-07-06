import axios from "axios";
import { getAuthToken, getStoredUser } from "./auth";
import { clearSession } from "./auth";

function resolveApiBaseUrl() {
  const configuredUrl = (process.env.REACT_APP_API_URL || "").trim();
  const browserHost = window.location.hostname;
  const isLocalBrowser =
    browserHost === "localhost" ||
    browserHost === "127.0.0.1" ||
    browserHost === "";

  if (
    configuredUrl &&
    !configuredUrl.includes("127.0.0.1") &&
    !configuredUrl.includes("localhost")
  ) {
    return configuredUrl.replace(/\/$/, "");
  }

  if (configuredUrl && isLocalBrowser) {
    return configuredUrl.replace(/\/$/, "");
  }

  return "/api";
}

const apiBaseUrl = resolveApiBaseUrl();

window.__BAZARIO_API_URL__ = apiBaseUrl;

const API = axios.create({
  baseURL: apiBaseUrl,
  timeout: Number(process.env.REACT_APP_API_TIMEOUT) || 5000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add token to requests if available
API.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && getAuthToken()) {
      clearSession();
      window.dispatchEvent(new Event("bazario:session-expired"));
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  register: (userData) => API.post("/auth/register", userData),
  login: (username, password) =>
    API.post("/auth/login", { username, password }),
  requestPasswordReset: (email) => API.post("/auth/forgot-password", { email }),
  resetPassword: (email, otp, newPassword) =>
    API.post("/auth/reset-password", { email, otp, new_password: newPassword }),
  changePassword: (currentPassword, newPassword) =>
    API.post("/auth/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
    }),
  revokeSessions: () => API.post("/auth/revoke-sessions"),
  getProfile: () => API.get("/auth/me"),
  updateProfile: (profile) => API.put("/auth/me", profile),
  getSellerOnboarding: () => API.get("/auth/seller-onboarding"),
  updateSellerOnboarding: (onboarding) => API.put("/auth/seller-onboarding", onboarding),
};

export const otpApi = {
  getChannels: () => API.get("/otp/channels"),
  send: (email, channel = "email", phone = "") =>
    API.post("/otp/send-otp", { email, channel, phone }),
  verify: (email, otp, channel = "email", phone = "") =>
    API.post("/otp/verify-otp", { email, otp, channel, phone }),
};

// Products API
export const productsApi = {
  getAll: () => API.get("/products/"),
  getById: (productId) => API.get(`/products/${productId}`),
  getMine: () => API.get("/products/mine"),
  add: (product) => API.post("/products/add", product),
  update: (productId, product) => API.put(`/products/${productId}`, product),
  uploadImage: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return API.post("/products/upload-image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 20000,
    });
  },
  updateStock: (productId, stock) =>
    API.put(`/products/${productId}/stock`, { stock }),
  updateVariantStock: (productId, options, stock) =>
    API.put(`/products/${productId}/variant-stock`, { options, stock }),
  remove: (productId) => API.delete(`/products/${productId}`),
};

export const adminApi = {
  getUsers: () => API.get("/admin/users"),
  getProducts: () => API.get("/admin/products"),
  getDisputes: () => API.get("/admin/disputes"),
  decideDispute: (orderId, decision, note) =>
    API.put(`/admin/disputes/${orderId}`, { decision, note }),
  reviewProduct: (productId, decision, note = "") =>
    API.put(`/admin/products/${productId}/review`, { decision, note }),
  deleteUser: (userId) => API.delete(`/admin/delete-user/${userId}`),
  deleteProduct: (productId) => API.delete(`/admin/delete-product/${productId}`),
};

// Cart API
export const cartApi = {
  getCart: () => API.get("/cart/"),
  addItem: (product, quantity, selectedOptions = {}) =>
    API.post("/cart/add", {
      product_id: product._id,
      product_name: product.name,
      price: product.price,
      image: product.image || "",
      quantity,
      selected_size: selectedOptions.size || "",
      selected_color: selectedOptions.colour || "",
      selected_options: selectedOptions,
    }),
  removeItem: (itemId) => API.delete(`/cart/remove/${itemId}`),
  updateQuantity: (itemId, quantity) => API.put(`/cart/${itemId}`, { quantity }),
};

// Orders API
export const ordersApi = {
  create: (order) => API.post("/orders/place", order),
  getAll: () => API.get("/orders/"),
  getSellerOrders: () => API.get("/orders/seller"),
  getSellerEarnings: () => API.get("/orders/seller/earnings"),
  cancel: (orderId) => API.post(`/orders/${orderId}/cancel`),
  requestReturn: (orderId, returnRequest) =>
    API.post(`/orders/${orderId}/return`, returnRequest),
  saveShipment: (orderId, shipment) =>
    API.put(`/orders/${orderId}/shipment`, shipment),
  downloadInvoice: (orderId) =>
    API.get(`/orders/${orderId}/invoice`, {
      responseType: "blob",
      timeout: 15000,
    }),
  openDispute: (orderId, category, reason) =>
    API.post(`/orders/${orderId}/dispute`, { category, reason }),
  decideReturn: (orderId, decision, note = "") =>
    API.put(`/orders/${orderId}/returns/decision`, { decision, note }),
  updateStatus: (orderId, status) =>
    API.put(`/orders/update-status/${orderId}`, null, { params: { status } }),
};

export const prescriptionsApi = {
  getCartStatus: () => API.get("/prescriptions/cart-status"),
  upload: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return API.post("/prescriptions/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 20000,
    });
  },
  getSellerAll: () => API.get("/prescriptions/seller"),
  getDocument: (prescriptionId) =>
    API.get(`/prescriptions/${prescriptionId}/document`, {
      responseType: "blob",
      timeout: 20000,
    }),
  decide: (prescriptionId, decision, note = "") =>
    API.put(`/prescriptions/${prescriptionId}/decision`, { decision, note }),
};

export const notificationsApi = {
  getAll: (limit = 20) => API.get("/notifications/", { params: { limit } }),
  markRead: (notificationId) =>
    API.put(`/notifications/${notificationId}/read`),
  markAllRead: () => API.put("/notifications/read-all"),
};

export const supportApi = {
  getMine: () => API.get("/support/"),
  create: (ticket) => API.post("/support/", ticket),
  reply: (ticketId, message) =>
    API.post(`/support/${ticketId}/reply`, { message }),
  getAdminAll: () => API.get("/support/admin"),
  adminReply: (ticketId, message) =>
    API.post(`/support/admin/${ticketId}/reply`, { message }),
  updateStatus: (ticketId, status) =>
    API.put(`/support/admin/${ticketId}/status`, { status }),
};

// Payments API
export const paymentsApi = {
  getConfig: () => API.get("/payment/config"),
  createOrder: (addressId, paymentMethod) =>
    API.post(
      "/payment/create-order",
      { address_id: addressId, payment_method: paymentMethod },
      { timeout: 15000 }
    ),
  verifyPayment: (paymentData) =>
    API.post("/payment/verify", paymentData, { timeout: 20000 }),
};

// Address API
export const addressApi = {
  getAll: () => API.get("/address/"),
  add: (address) => API.post("/address/add", address),
  update: (addressId, address) => API.put(`/address/${addressId}`, address),
  remove: (addressId) => API.delete(`/address/${addressId}`),
};

// Reviews API
export const reviewsApi = {
  getAll: (productId) =>
    API.get("/reviews/", { params: productId ? { product_id: productId } : {} }),
  add: (review) => API.post("/reviews/add", review),
  sellerReply: (reviewId, message) =>
    API.put(`/reviews/${reviewId}/seller-reply`, { message }),
};

// Wishlist API
export const wishlistApi = {
  getAll: () => API.get("/wishlist/"),
  add: (productId) => API.post("/wishlist/add", { product_id: productId }),
  remove: (itemId) => API.delete(`/wishlist/remove/${itemId}`),
};

export function requireStoredUser() {
  const user = getStoredUser();
  if (!user) throw new Error("Please login to continue.");
  return user;
}

export default API;
