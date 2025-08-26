"use client";

import Link from "next/link";
import React from "react";
import { motion } from "framer-motion";

export default function Footer() {
  return (
    <motion.footer
      className="bg-gradient-to-r from-black via-gray-900 to-gray-800 text-white px-8 py-6 mt-12 shadow-inner backdrop-blur-md"
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
        {/* Brand echo */}
        <div className="text-xl font-bold tracking-tight text-center sm:text-left">
          <span className="text-white inline-block rotate-[-5deg]">Molo</span>{" "}
          <span className="text-blue-400 text-base px-2">Search Intelligence</span>
        </div>

        {/* Footer nav */}


        {/* Copyright */}
        <div className="text-gray-400 text-xs text-center sm:text-right">
          &copy; {new Date().getFullYear()} Molo — All rights reserved.
        </div>
      </div>
    </motion.footer>
  );
}
