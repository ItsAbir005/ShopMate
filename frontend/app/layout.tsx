"use client";

import "./globals.css";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CartProvider, useCart } from "./context/CartContext";
import { ToastProvider } from "./components/Toast";
import SupportAgent from "./components/SupportAgent";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ShoppingCart, Tag, User as UserIcon, LogOut, Menu, X } from "lucide-react";

function Navigation() {
  const { user, logout } = useAuth();
  const { itemCount } = useCart();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  return (
    <nav className="glass-nav bg-white border-b border-gray-200">
      <div className="container-custom flex justify-between items-center h-16">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold tracking-tight text-gray-900 hover:text-indigo-600 transition-colors">
            ShopMate
          </Link>
          <div className="hidden md:flex gap-6 items-center">
            <Link href="/" className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">
              Home
            </Link>
            <Link href="/categories" className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">
              Categories
            </Link>
            <Link href="/products" className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">
              Products
            </Link>
            {mounted && user && (
              <Link href="/orders" className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">
                Orders
              </Link>
            )}
            {mounted && user && (
              <Link href="/sell" className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                <span>Sell</span>
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Cart icon with live badge */}
          <Link href="/cart" className="relative text-gray-600 hover:text-gray-900 transition-colors text-sm flex items-center gap-1.5 p-1.5 rounded-lg hover:bg-gray-100">
            <ShoppingCart className="w-4 h-4 text-gray-700" />
            <span className="hidden sm:inline font-medium">Cart</span>
            {mounted && itemCount > 0 && (
              <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {itemCount > 99 ? "99+" : itemCount}
              </span>
            )}
          </Link>

          {mounted && user ? (
            <div className="flex gap-3 items-center">
              <Link href="/profile" className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium text-sm">
                <UserIcon className="w-3.5 h-3.5" />
                <span>{user.name.split(" ")[0]}</span>
              </Link>
              <button
                onClick={logout}
                className="hidden sm:flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 px-2.5 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <LogOut className="w-3 h-3" />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <Link href="/login" className="btn btn-primary text-sm py-2 px-4 shadow-none">
              Sign In
            </Link>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 flex flex-col gap-2">
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            className="text-gray-700 hover:text-indigo-600 text-sm font-medium py-1.5"
          >
            Home
          </Link>
          <Link
            href="/categories"
            onClick={() => setMobileMenuOpen(false)}
            className="text-gray-700 hover:text-indigo-600 text-sm font-medium py-1.5"
          >
            Categories
          </Link>
          <Link
            href="/products"
            onClick={() => setMobileMenuOpen(false)}
            className="text-gray-700 hover:text-indigo-600 text-sm font-medium py-1.5"
          >
            Products
          </Link>
          {mounted && user && (
            <Link
              href="/orders"
              onClick={() => setMobileMenuOpen(false)}
              className="text-gray-700 hover:text-indigo-600 text-sm font-medium py-1.5"
            >
              Orders
            </Link>
          )}
          {mounted && user && (
            <Link
              href="/sell"
              onClick={() => setMobileMenuOpen(false)}
              className="text-gray-700 hover:text-indigo-600 text-sm font-medium py-1.5 flex items-center gap-1.5"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Sell</span>
            </Link>
          )}
          {mounted && user && (
            <button
              onClick={() => { logout(); setMobileMenuOpen(false); }}
              className="text-left text-gray-600 hover:text-red-600 text-sm font-medium py-1.5 flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          )}
        </div>
      )}
    </nav>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased flex flex-col min-h-screen bg-white text-gray-900">
        <AuthProvider>
          <CartProvider>
            <ToastProvider>
              <Navigation />
              <main className="flex-1">{children}</main>
              <footer className="border-t border-gray-200 bg-white py-8 mt-16 text-center text-sm text-gray-500">
                <div className="container-custom flex flex-col sm:flex-row items-center justify-between gap-4">
                  <span className="font-semibold text-gray-800">ShopMate</span>
                  <p>© {new Date().getFullYear()} ShopMate. All rights reserved.</p>
                  <div className="flex gap-4 text-xs text-gray-500">
                    <Link href="/products" className="hover:text-gray-800">Products</Link>
                    <Link href="/categories" className="hover:text-gray-800">Categories</Link>
                    <Link href="/login" className="hover:text-gray-800">Sign In</Link>
                  </div>
                </div>
              </footer>
              <SupportAgent />
            </ToastProvider>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
