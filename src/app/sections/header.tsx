"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import React from "react";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/spider", label: "Spider" },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <motion.header
      className="bg-gradient-to-r from-black via-gray-900 to-gray-800 text-white px-8 py-4 h-20 flex items-center justify-between sticky top-0 z-50 shadow-lg backdrop-blur-md"
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
<div className="text-xl font-bold tracking-tight">
  <span className="text-white text-2xl inline-block rotate-[-5deg]">Molo</span>{' '}
  <span className="text-blue-400 text-xl inline-block px-4">Search Intelligence</span>
</div>

      <nav className="flex gap-8 text-sm font-medium">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`transition-colors duration-200 ${
                isActive
                  ? "text-blue-400 border-b-2 border-blue-400 pb-1"
                  : "hover:text-blue-300"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </motion.header>
  );
}
