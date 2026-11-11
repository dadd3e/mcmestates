import React from 'react';
import { motion } from 'motion/react';

interface StatCardProps {
  id?: string;
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color?: 'dark' | 'amber' | 'emerald' | 'blue' | 'purple' | 'red';
}

export default function StatCard({ id, title, value, subtitle, icon, color = 'dark' }: StatCardProps) {
  const borderAccents = {
    dark: 'border-l-4 border-l-amber-500 border-t border-r border-b border-[#2C2C2A]',
    amber: 'border-l-4 border-l-amber-600 border-t border-r border-b border-[#E5E5E0]',
    emerald: 'border-l-4 border-l-emerald-600 border-t border-r border-b border-[#E5E5E0]',
    blue: 'border-l-4 border-l-blue-600 border-t border-r border-b border-[#E5E5E0]',
    purple: 'border-l-4 border-l-purple-600 border-t border-r border-b border-[#E5E5E0]',
    red: 'border-l-4 border-l-red-600 border-t border-r border-b border-[#E5E5E0]',
  };

  const colorStyles = {
    dark: 'bg-[#1E1E1D] text-white',
    amber: 'bg-white text-gray-900',
    emerald: 'bg-white text-gray-900',
    blue: 'bg-white text-gray-900',
    purple: 'bg-white text-gray-900',
    red: 'bg-white text-gray-900',
  };

  const iconColors = {
    dark: 'text-amber-400 bg-[#2D2D2C]',
    amber: 'text-amber-600 bg-amber-50/70',
    emerald: 'text-emerald-600 bg-emerald-50/70',
    blue: 'text-blue-600 bg-blue-50/70',
    purple: 'text-purple-600 bg-purple-50/70',
    red: 'text-red-600 bg-red-50/70',
  };

  const glows = {
    dark: 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]',
    amber: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]',
    emerald: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]',
    blue: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]',
    purple: 'bg-purple-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]',
    red: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]',
  };

  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      className={`p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.06)] hover:border-gray-300 transition-all duration-200 flex items-start justify-between rounded-none ${borderAccents[color]} ${colorStyles[color]}`}
    >
      <div className="space-y-1 min-w-0 flex-1 pr-2">
        <p className={`text-[10px] font-bold uppercase tracking-wider truncate ${color === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
          {title}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <h4 className="text-xl sm:text-2xl xl:text-3xl font-sans tracking-tight font-semibold truncate">
            {value}
          </h4>
          <span className="flex h-2 w-2 relative shrink-0">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${color === 'dark' ? 'bg-amber-400' : glows[color].split(' ')[0]}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${glows[color].split(' ')[0]}`}></span>
          </span>
        </div>
        {subtitle && (
          <p className={`text-[11px] mt-1.5 leading-tight truncate ${color === 'dark' ? 'text-gray-400' : 'text-gray-400 font-medium'}`}>
            {subtitle}
          </p>
        )}
      </div>
      <div className={`p-2.5 sm:p-3 shrink-0 ml-2 border border-transparent hover:border-gray-100 transition-all duration-150 ${iconColors[color]}`}>
        {icon}
      </div>
    </motion.div>
  );
}

