import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

// Ubuntu official Circle of Friends SVG Logo
export const UbuntuIcon: React.FC<IconProps> = ({ className = 'w-5 h-5', size }) => (
  <svg
    viewBox="0 0 100 100"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="50" cy="50" r="48" fill="#E95420" />
    <circle cx="50" cy="50" r="28" stroke="#FFFFFF" strokeWidth="9.5" fill="none" />
    <circle cx="19.5" cy="50" r="6.8" fill="#FFFFFF" />
    <circle cx="65.25" cy="23.6" r="6.8" fill="#FFFFFF" />
    <circle cx="65.25" cy="76.4" r="6.8" fill="#FFFFFF" />
    <path d="M50 50 L10 50" stroke="#E95420" strokeWidth="5.5" strokeLinecap="round" />
    <path d="M50 50 L75 32" stroke="#E95420" strokeWidth="5.5" strokeLinecap="round" />
    <path d="M50 50 L75 68" stroke="#E95420" strokeWidth="5.5" strokeLinecap="round" />
  </svg>
);

// Windows XP Classic 4-Color Flying Flag Logo
export const WindowsXPIcon: React.FC<IconProps> = ({ className = 'w-5 h-5', size }) => (
  <svg
    viewBox="0 0 100 100"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M14 26 C28 18 36 28 47 24 L47 48 C36 52 27 42 14 50 Z" fill="#F25022" />
    <path d="M53 23 C64 27 74 17 86 21 L86 46 C74 42 64 51 53 47 Z" fill="#7FBA00" />
    <path d="M14 54 C27 46 36 56 47 52 L47 76 C36 80 27 70 14 78 Z" fill="#00A4EF" />
    <path d="M53 51 C64 55 74 45 86 49 L86 73 C74 69 64 79 53 75 Z" fill="#FFB900" />
  </svg>
);

// Debian Swirl Logo
export const DebianIcon: React.FC<IconProps> = ({ className = 'w-5 h-5', size }) => (
  <svg
    viewBox="0 0 100 100"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="100" height="100" rx="20" fill="#D70A53" />
    <path
      d="M50 20 C32 20 20 34 22 52 C24 70 42 82 58 78 C70 75 80 62 76 48 C73 38 60 32 50 36 C42 40 40 50 44 58 C47 64 55 65 58 60 C60 56 57 50 52 50"
      stroke="#FFFFFF"
      strokeWidth="7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Alpine Linux Mountain Logo
export const AlpineIcon: React.FC<IconProps> = ({ className = 'w-5 h-5', size }) => (
  <svg
    viewBox="0 0 100 100"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="100" height="100" rx="20" fill="#0D597F" />
    <path d="M18 78 L50 25 L82 78 Z" fill="#0D597F" stroke="#FFFFFF" strokeWidth="6" strokeLinejoin="round" />
    <path d="M35 78 L50 50 L65 78 Z" fill="#FFFFFF" />
    <path d="M42 38 L50 25 L58 38 Z" fill="#FFFFFF" />
  </svg>
);

// Kali Linux Dragon/Shield Logo
export const KaliIcon: React.FC<IconProps> = ({ className = 'w-5 h-5', size }) => (
  <svg
    viewBox="0 0 100 100"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="100" height="100" rx="20" fill="#171A21" />
    <path d="M50 12 L85 28 L85 58 C85 75 50 90 50 90 C50 90 15 75 15 58 L15 28 Z" fill="#252A36" stroke="#557C93" strokeWidth="4" />
    <path
      d="M32 45 C40 35 60 35 68 45 C55 48 50 58 50 72 C50 58 45 48 32 45 Z"
      fill="#3D82A2"
    />
  </svg>
);

// Generic Linux Tux Emblem Logo
export const GenericLinuxIcon: React.FC<IconProps> = ({ className = 'w-5 h-5', size }) => (
  <svg
    viewBox="0 0 100 100"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="100" height="100" rx="20" fill="#334155" />
    <circle cx="50" cy="40" r="18" fill="#F8FAFC" />
    <path d="M32 78 C32 55 68 55 68 78 Z" fill="#F8FAFC" />
    <circle cx="43" cy="36" r="3" fill="#0F172A" />
    <circle cx="57" cy="36" r="3" fill="#0F172A" />
    <path d="M45 44 C48 48 52 48 55 44 Z" fill="#F59E0B" />
  </svg>
);

// Fixcat OS Manager Brand Logo (Sleek Cyber Cat / Gear SVG)
export const FixcatLogo: React.FC<IconProps> = ({ className = 'w-8 h-8', size }) => (
  <svg
    viewBox="0 0 100 100"
    className={className}
    style={size ? { width: size, height: size } : undefined}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Hexagon Shield Frame */}
    <path
      d="M50 6 L88 28 L88 72 L50 94 L12 72 L12 28 Z"
      fill="#0F172A"
      stroke="#3B82F6"
      strokeWidth="5"
      strokeLinejoin="round"
    />
    {/* Cat Ears */}
    <path d="M26 36 L38 22 L46 34 Z" fill="#3B82F6" />
    <path d="M74 36 L62 22 L54 34 Z" fill="#3B82F6" />
    {/* Cat Face & Cyber Visor */}
    <path
      d="M24 40 C24 35 76 35 76 40 L72 62 C70 70 58 74 50 74 C42 74 30 70 28 62 Z"
      fill="#1E293B"
      stroke="#60A5FA"
      strokeWidth="3"
    />
    {/* Visor Glow Eyes */}
    <path d="M32 48 L44 48" stroke="#38BDF8" strokeWidth="5" strokeLinecap="round" />
    <path d="M56 48 L68 48" stroke="#38BDF8" strokeWidth="5" strokeLinecap="round" />
    {/* Wrench / Wiskers Icon */}
    <path d="M44 60 L56 60 M50 56 L50 66" stroke="#10B981" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export const OnePanelLogo = FixcatLogo;

// Helper function to pick correct OS SVG icon
export const getOSIcon = (osType: string, className = 'w-6 h-6') => {
  const type = (osType || '').toLowerCase();
  if (type.includes('ubuntu')) return <UbuntuIcon className={className} />;
  if (type.includes('xp') || type.includes('winxp') || type.includes('windows')) return <WindowsXPIcon className={className} />;
  if (type.includes('debian')) return <DebianIcon className={className} />;
  if (type.includes('alpine')) return <AlpineIcon className={className} />;
  if (type.includes('kali')) return <KaliIcon className={className} />;
  return <GenericLinuxIcon className={className} />;
};
