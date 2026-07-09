"use client";

import React from "react";

interface PopupProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function AddSalesPopup({ isOpen, onClose, children }: PopupProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md transition-opacity duration-300">
      {/* Click outside to close */}
      <div 
        className="absolute inset-0 cursor-pointer" 
        onClick={onClose}
        aria-label="Close popup"
      />
      
      {/* Popup content box */}
      <div className="relative z-10 w-full max-w-md mx-4 p-8 bg-slate-900 rounded-2xl shadow-2xl shadow-black/80 border border-slate-800 transform transition-all duration-300">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-300 hover:bg-slate-800 rounded-lg transition-colors duration-200"
          aria-label="Close popup"
        >
          <span className="text-2xl">✕</span>
        </button>
        
        {/* Content */}
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}
