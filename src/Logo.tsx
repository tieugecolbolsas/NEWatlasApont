/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export default function Logo({ className = "w-16 h-16" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={className}
    >
      {/* Outer Ring - Orbit representation */}
      <circle 
        cx="50" 
        cy="50" 
        r="44" 
        stroke="#00624C" 
        strokeWidth="3.5" 
        strokeDasharray="210 40" 
        strokeLinecap="round"
        className="animate-[spin_20s_linear_infinite]"
      />
      
      {/* Dynamic inner orbit ring */}
      <circle 
        cx="50" 
        cy="50" 
        r="34" 
        stroke="#00624C" 
        strokeWidth="1" 
        strokeOpacity="0.4"
        strokeDasharray="5 5"
      />
      
      {/* Styled geometric silhouette representing Kudryavka profile */}
      <path 
        d="M50 48C51.5 48 53 49 53 50.5C53 52 51.5 53 50 53H48.5C47 53 46 54 46 55.5V57L44 59L43.5 54.5C43.5 53 44.5 51.5 46 50.5C47.5 49.5 48.5 48 50 48Z" 
        fill="currentColor"
      />

      {/* Modern minimalist tech crosshairs */}
      <line x1="50" y1="2" x2="50" y2="12" stroke="#00624C" strokeWidth="2" strokeLinecap="round" />
      <line x1="50" y1="88" x2="50" y2="98" stroke="#00624C" strokeWidth="2" strokeLinecap="round" />
      <line x1="2" y1="50" x2="12" y2="50" stroke="#00624C" strokeWidth="2" strokeLinecap="round" />
      <line x1="88" y1="50" x2="98" y2="50" stroke="#00624C" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

