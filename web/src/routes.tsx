import { Routes, Route, Navigate } from "react-router-dom";
import App from "./App"; // your existing App (login + Browse)
import VendorDetail from "./pages/VendorDetail";
import ProductDetail from "./pages/ProductDetail";

export default function RoutesRoot() {
  return (
    <Routes>
      {/* Your existing App handles login + browse */}
      <Route path="/" element={<App />} />
      <Route path="/browse" element={<App />} />
      <Route path="/login" element={<App />} />

      {/* New detail pages */}
      <Route path="/vendors/:id" element={<VendorDetail />} />
      <Route path="/products/:id" element={<ProductDetail />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}