import { useAuth } from '../context/AuthContext.jsx';

export function BrandMark({ size = 38, className = '' }) {
  return (
    <svg
      className={`brand-mark ${className}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="15" fill="#f5b301" />
      <path d="M18 25.5 32 17l14 8.5v16.8c0 4.2-3.4 7.7-7.7 7.7H25.7c-4.2 0-7.7-3.4-7.7-7.7V25.5Z" fill="#111d2b" />
      <path d="M25.5 26.5h13v14c0 3-2.4 5.5-5.5 5.5h-2c-3 0-5.5-2.4-5.5-5.5v-14Z" fill="#f5b301" opacity=".24" />
      <path d="M27 33.5h10M27 38.5h7" stroke="#f5b301" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M23 22.5 32 17l9 5.5" fill="none" stroke="#fff7e6" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ collapsed = false, light = false, size = 38 }) {
  const { business } = useAuth();
  return (
    <div className={`brand ${light ? 'brand-light' : ''} ${collapsed ? 'brand-collapsed' : ''}`}>
      <BrandMark size={size} />
      {!collapsed && (
        <div className="brand-copy">
          <span className="brand-name">{business?.shortName || 'CementoControl'}</span>
          <span className="brand-tagline">Control de ventas</span>
        </div>
      )}
    </div>
  );
}

export function CompanyLogo({ business, size = 46 }) {
  if (business?.logo) {
    return <img src={business.logo} alt={`Logo de ${business.name}`} style={{ height: size, maxWidth: size * 3, objectFit: 'contain' }} />;
  }
  return <BrandMark size={size} />;
}

export function CementIllustration() {
  return (
    <svg viewBox="0 0 520 480" className="cement-illustration" role="img" aria-label="Ilustración de bultos de cemento">
      <defs>
        <linearGradient id="bagFront" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#f7d982" />
          <stop offset="1" stopColor="#e8ad22" />
        </linearGradient>
        <linearGradient id="bagSide" x1="0" x2="1">
          <stop offset="0" stopColor="#d79a15" />
          <stop offset="1" stopColor="#b97e09" />
        </linearGradient>
        <linearGradient id="floor" x1="0" x2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".14" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="22" stdDeviation="18" floodColor="#060d14" floodOpacity=".35" />
        </filter>
      </defs>
      <circle cx="365" cy="140" r="140" fill="#f5b301" opacity=".08" />
      <circle cx="120" cy="80" r="2.5" fill="#f5b301" opacity=".75" />
      <circle cx="450" cy="320" r="2" fill="#f5b301" opacity=".55" />
      <path d="M20 432h480" stroke="url(#floor)" strokeWidth="2" />
      <g filter="url(#softShadow)">
        <g transform="translate(102 270) rotate(-5)">
          <path d="M12 55c5-28 38-50 105-50s100 22 105 50l12 92c3 24-26 39-117 39S-3 171 0 147L12 55Z" fill="url(#bagFront)" />
          <path d="M12 55c5-28 38-50 105-50s100 22 105 50" fill="none" stroke="#fff1c2" strokeWidth="3" opacity=".55" />
          <path d="M27 120h180M27 142h138" stroke="#111d2b" strokeWidth="9" strokeLinecap="round" opacity=".82" />
          <path d="M43 162h103" stroke="#111d2b" strokeWidth="4" strokeLinecap="round" opacity=".38" />
          <text x="32" y="83" fill="#111d2b" fontFamily="Manrope, sans-serif" fontWeight="800" fontSize="25" letterSpacing="-1">CEMENTO</text>
          <text x="32" y="105" fill="#111d2b" fontFamily="Manrope, sans-serif" fontWeight="600" fontSize="12" letterSpacing="2">ANDINO · 50 KG</text>
          <path d="M160 45c20 14 21 36 4 58" stroke="#b97e09" strokeWidth="2" opacity=".35" fill="none" />
          <circle cx="193" cy="122" r="24" fill="#111d2b" opacity=".12" />
          <text x="182" y="130" fill="#111d2b" fontFamily="Manrope, sans-serif" fontWeight="800" fontSize="15" opacity=".75">42</text>
        </g>
        <g transform="translate(296 205) rotate(7)">
          <path d="M12 55c5-28 38-50 105-50s100 22 105 50l12 92c3 24-26 39-117 39S-3 171 0 147L12 55Z" fill="url(#bagFront)" opacity=".97" />
          <path d="M12 55c5-28 38-50 105-50s100 22 105 50" fill="none" stroke="#fff1c2" strokeWidth="3" opacity=".5" />
          <path d="M27 120h180M27 142h138" stroke="#111d2b" strokeWidth="9" strokeLinecap="round" opacity=".82" />
          <path d="M43 162h103" stroke="#111d2b" strokeWidth="4" strokeLinecap="round" opacity=".38" />
          <text x="32" y="83" fill="#111d2b" fontFamily="Manrope, sans-serif" fontWeight="800" fontSize="25" letterSpacing="-1">CEMENTO</text>
          <text x="32" y="105" fill="#111d2b" fontFamily="Manrope, sans-serif" fontWeight="600" fontSize="12" letterSpacing="2">ANDINO · 50 KG</text>
        </g>
      </g>
      <g transform="translate(335 60)">
        <rect width="136" height="62" rx="12" fill="#fffdf8" opacity=".96" />
        <text x="16" y="24" fill="#6b7280" fontFamily="Manrope, sans-serif" fontWeight="600" fontSize="10">VENTAS DEL MES</text>
        <text x="16" y="46" fill="#111d2b" fontFamily="Manrope, sans-serif" fontWeight="800" fontSize="18">$145,4 M</text>
        <circle cx="112" cy="36" r="8" fill="#28a745" opacity=".18" />
        <path d="m108 38 3-4 3 3 4-6" stroke="#28a745" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
      <g transform="translate(50 120)">
        <rect width="150" height="54" rx="12" fill="#fffdf8" opacity=".1" stroke="#fff" strokeOpacity=".12" />
        <text x="16" y="22" fill="#f8e7b3" fontFamily="Manrope, sans-serif" fontWeight="600" fontSize="9">CARTERA AL DÍA</text>
        <text x="16" y="41" fill="#ffffff" fontFamily="Manrope, sans-serif" fontWeight="700" fontSize="16">73,4%</text>
        <rect x="91" y="31" width="42" height="6" rx="3" fill="#ffffff" opacity=".15" />
        <rect x="91" y="31" width="31" height="6" rx="3" fill="#f5b301" />
      </g>
    </svg>
  );
}
