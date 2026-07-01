import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import About from "./pages/About";
import AdminDashboard from "./pages/admin/AdminDashboard";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import LandingPage from "./pages/LandingPage";
import Login from "./pages/Login";
import MyOrders from "./pages/MyOrders";
import Notifications from "./pages/Notifications";
import ProductDetails from "./pages/ProductDetails";
import Products from "./pages/Products";
import Profile from "./pages/Profile";
import Register from "./pages/Register";
import Support from "./pages/Support";
import SellerDashboard from "./pages/seller/SellerDashboard";
import SellerOnboarding from "./pages/seller/SellerOnboarding";
import SellerOrders from "./pages/seller/SellerOrders";
import ProtectedRoute from "./routes/ProtectedRoute";

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<About />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:productId" element={<ProductDetails />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/profile" element={<ProtectedRoute allowedRoles={["admin", "customer", "seller"]}><Profile /></ProtectedRoute>} />
        <Route path="/cart" element={<ProtectedRoute allowedRoles={["customer"]}><Cart /></ProtectedRoute>} />
        <Route path="/checkout" element={<ProtectedRoute allowedRoles={["customer"]}><Checkout /></ProtectedRoute>} />
        <Route path="/my-orders" element={<ProtectedRoute allowedRoles={["customer"]}><MyOrders /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute allowedRoles={["admin", "customer", "seller"]}><Notifications /></ProtectedRoute>} />
        <Route path="/support" element={<ProtectedRoute allowedRoles={["admin", "customer", "seller"]}><Support /></ProtectedRoute>} />
        <Route
          path="/seller-dashboard"
          element={<ProtectedRoute allowedRoles={["seller"]}><SellerDashboard /></ProtectedRoute>}
        />
        <Route
          path="/seller-onboarding"
          element={<ProtectedRoute allowedRoles={["seller"]}><SellerOnboarding /></ProtectedRoute>}
        />
        <Route
          path="/seller-orders"
          element={<ProtectedRoute allowedRoles={["seller"]}><SellerOrders /></ProtectedRoute>}
        />
        <Route
          path="/admin-dashboard"
          element={<ProtectedRoute allowedRoles={["admin"]}><AdminDashboard /></ProtectedRoute>}
        />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
