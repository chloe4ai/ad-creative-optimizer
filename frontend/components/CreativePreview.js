// What the ad actually looks like.
//
// The demo's creatives are original illustrations for a fictional outdoor brand
// ("Fernhill"), drawn here as inline SVG so the demo has no external image dependency.
// The frames are generic placements (feed post, vertical video, search result, display
// banner), not reproductions of any platform's interface.
//
// Against a real backend a creative has no `art` key, so the preview falls back to the
// synced `thumbnail_url` and headline.

const INK = '#0f172a';

const ART = {
  // 1 · Summer Sale Banner A — static sale banner
  summerSale: {
    ratio: [400, 400],
    alt: 'Static banner: a sun over waves with the words Summer Sale, up to 50% off',
    draw: () => (
      <>
        <rect width="400" height="400" fill="#fde68a" />
        <circle cx="300" cy="110" r="62" fill="#fb923c" />
        <path d="M0 270 Q50 240 100 270 T200 270 T300 270 T400 270 V400 H0Z" fill="#38bdf8" />
        <path d="M0 310 Q50 285 100 310 T200 310 T300 310 T400 310 V400 H0Z" fill="#0ea5e9" />
        <text x="32" y="120" fontSize="54" fontWeight="800" fill={INK}>SUMMER</text>
        <text x="32" y="176" fontSize="54" fontWeight="800" fill={INK}>SALE</text>
        <rect x="32" y="198" width="190" height="44" rx="22" fill={INK} />
        <text x="127" y="227" fontSize="20" fontWeight="700" fill="#fff" textAnchor="middle">UP TO 50% OFF</text>
      </>
    ),
  },
  // 2 · New Arrivals Carousel — three product cards
  newArrivals: {
    ratio: [400, 400],
    alt: 'Carousel: three product cards showing a trail shoe, a backpack and a cap, tagged New',
    draw: () => (
      <>
        <rect width="400" height="400" fill="#eef2ff" />
        <text x="24" y="52" fontSize="26" fontWeight="800" fill={INK}>JUST DROPPED</text>
        {[
          { x: 20, bg: '#c7d2fe', price: '$89' },
          { x: 146, bg: '#bbf7d0', price: '$120' },
          { x: 272, bg: '#fecdd3', price: '$32' },
        ].map((c, i) => (
          <g key={c.x} transform={`translate(${c.x} 84)`}>
            <rect width="108" height="250" rx="12" fill="#fff" />
            <rect x="8" y="8" width="92" height="150" rx="8" fill={c.bg} />
            {i === 0 && (
              <path d="M22 118 q8 -34 30 -34 l8 16 q22 6 28 20 v8 h-66z" fill={INK} />
            )}
            {i === 1 && (
              <>
                <rect x="30" y="52" width="48" height="78" rx="14" fill={INK} />
                <rect x="40" y="92" width="28" height="24" rx="5" fill="#bbf7d0" />
                <path d="M40 54 q14 -22 28 0" stroke={INK} strokeWidth="5" fill="none" />
              </>
            )}
            {i === 2 && (
              <>
                <path d="M26 110 q0 -44 34 -44 q28 0 28 44z" fill={INK} />
                <path d="M22 112 h46 q12 0 22 10 h-68z" fill={INK} />
              </>
            )}
            <rect x="8" y="14" width="40" height="18" rx="9" fill="#4f46e5" />
            <text x="28" y="27" fontSize="11" fontWeight="700" fill="#fff" textAnchor="middle">NEW</text>
            <rect x="12" y="176" width="70" height="8" rx="4" fill="#cbd5e1" />
            <rect x="12" y="192" width="46" height="8" rx="4" fill="#e2e8f0" />
            <text x="12" y="232" fontSize="18" fontWeight="800" fill={INK}>{c.price}</text>
          </g>
        ))}
        {[188, 200, 212].map((x, i) => (
          <circle key={x} cx={x} cy="366" r="4" fill={i === 0 ? '#4f46e5' : '#c7d2fe'} />
        ))}
      </>
    ),
  },
  // 3 · Retargeting Loop V2 — cart reminder display banner
  retargeting: {
    ratio: [400, 400],
    alt: 'Display banner: a shopping cart holding a backpack, with the words We miss you, your cart is still here',
    draw: () => (
      <>
        <rect width="400" height="400" fill="#ecfeff" />
        <circle cx="290" cy="200" r="120" fill="#a5f3fc" />
        <path d="M206 150 h24 l22 96 h96 l16 -68 h-128" stroke={INK} strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="266" cy="274" r="12" fill={INK} />
        <circle cx="336" cy="274" r="12" fill={INK} />
        <rect x="270" y="128" width="54" height="50" rx="12" fill="#0e7490" />
        <rect x="282" y="150" width="30" height="16" rx="4" fill="#a5f3fc" />
        <text x="28" y="96" fontSize="40" fontWeight="800" fill={INK}>We miss</text>
        <text x="28" y="142" fontSize="40" fontWeight="800" fill={INK}>you.</text>
        <text x="28" y="330" fontSize="18" fontWeight="600" fill="#155e75">Your cart is still here.</text>
        <text x="28" y="356" fontSize="18" fontWeight="600" fill="#155e75">Free shipping today.</text>
      </>
    ),
  },
  // 4 · Brand Awareness Video — vertical video, mountain scene
  brandVideo: {
    ratio: [360, 640],
    alt: 'Vertical video frame: a hiker on a ridge at sunrise, captioned Go further',
    draw: () => (
      <>
        <defs>
          <linearGradient id="art-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1e3a8a" />
            <stop offset="0.6" stopColor="#f97316" />
            <stop offset="1" stopColor="#fde68a" />
          </linearGradient>
        </defs>
        <rect width="360" height="640" fill="url(#art-sky)" />
        <circle cx="180" cy="372" r="54" fill="#fef3c7" />
        <path d="M0 460 L90 320 L150 400 L230 280 L360 450 V640 H0Z" fill="#334155" />
        <path d="M0 520 L110 420 L200 500 L290 430 L360 500 V640 H0Z" fill="#1e293b" />
        <circle cx="226" cy="262" r="7" fill={INK} />
        <path d="M226 270 v22 m0 -14 l-9 10 m9 -10 l9 8 m-9 6 l-7 14 m7 -14 l8 14" stroke={INK} strokeWidth="4" strokeLinecap="round" />
        <text x="180" y="150" fontSize="46" fontWeight="800" fill="#fff" textAnchor="middle">GO FURTHER</text>
      </>
    ),
  },
  // 5 · New User Acquisition — vertical video, first-order offer
  userAcquisition: {
    ratio: [360, 640],
    alt: 'Vertical video frame: a phone showing the Fernhill app with a $10 off your first order coupon',
    draw: () => (
      <>
        <rect width="360" height="640" fill="#4c1d95" />
        <circle cx="60" cy="110" r="90" fill="#6d28d9" />
        <circle cx="320" cy="560" r="120" fill="#6d28d9" />
        <rect x="100" y="150" width="160" height="300" rx="24" fill={INK} />
        <rect x="110" y="166" width="140" height="268" rx="14" fill="#f5f3ff" />
        <rect x="122" y="182" width="116" height="70" rx="10" fill="#ddd6fe" />
        <rect x="122" y="264" width="116" height="92" rx="10" fill="#facc15" />
        <text x="180" y="304" fontSize="30" fontWeight="800" fill={INK} textAnchor="middle">$10 OFF</text>
        <text x="180" y="334" fontSize="13" fontWeight="700" fill={INK} textAnchor="middle">YOUR FIRST ORDER</text>
        <rect x="122" y="370" width="116" height="34" rx="17" fill="#6d28d9" />
        <text x="180" y="392" fontSize="14" fontWeight="700" fill="#fff" textAnchor="middle">Join now</text>
        <text x="180" y="100" fontSize="34" fontWeight="800" fill="#fff" textAnchor="middle">New here?</text>
      </>
    ),
  },
  // 7 · Flash Sale Countdown — countdown clock, "ends tonight"
  flashSale: {
    ratio: [400, 400],
    alt: 'Static image: a countdown clock reading 4 days, 5 hours, 59 minutes under the words Flash Sale 40% off, ends Sunday',
    draw: () => (
      <>
        <rect width="400" height="400" fill="#111827" />
        <path d="M250 0 L150 190 H215 L170 400 L330 150 H255 L320 0Z" fill="#facc15" opacity="0.18" />
        <text x="200" y="78" fontSize="24" fontWeight="800" fill="#facc15" textAnchor="middle" letterSpacing="6">FLASH SALE</text>
        <text x="200" y="168" fontSize="86" fontWeight="900" fill="#fff" textAnchor="middle">40% OFF</text>
        {['04', '05', '59'].map((d, i) => (
          <g key={d} transform={`translate(${62 + i * 98} 206)`}>
            <rect width="80" height="84" rx="10" fill="#dc2626" />
            <rect y="41" width="80" height="2" fill="#111827" opacity="0.35" />
            <text x="40" y="60" fontSize="46" fontWeight="800" fill="#fff" textAnchor="middle">{d}</text>
            <text x="40" y="106" fontSize="11" fontWeight="700" fill="#9ca3af" textAnchor="middle">{['DAYS', 'HRS', 'MIN'][i]}</text>
          </g>
        ))}
        {[150, 248].map((x) => (
          <text key={x} x={x} y="262" fontSize="40" fontWeight="800" fill="#fff" textAnchor="middle">:</text>
        ))}
        <rect x="100" y="334" width="200" height="42" rx="21" fill="#facc15" />
        <text x="200" y="362" fontSize="20" fontWeight="800" fill="#111827" textAnchor="middle">ENDS SUNDAY</text>
      </>
    ),
  },
  // 8 · Product Showcase — product shot with rating
  productShowcase: {
    ratio: [400, 400],
    alt: 'Product image: a green backpack on a plain background with a Best seller badge and five stars',
    draw: () => (
      <>
        <rect width="400" height="400" fill="#f1f5f9" />
        <ellipse cx="200" cy="338" rx="110" ry="14" fill="#cbd5e1" />
        <path d="M150 120 q50 -70 100 0" stroke="#14532d" strokeWidth="12" fill="none" strokeLinecap="round" />
        <rect x="120" y="110" width="160" height="220" rx="44" fill="#15803d" />
        <rect x="146" y="206" width="108" height="88" rx="16" fill="#166534" />
        <rect x="146" y="150" width="108" height="10" rx="5" fill="#bbf7d0" />
        <rect x="188" y="222" width="24" height="10" rx="5" fill="#bbf7d0" />
        <rect x="24" y="24" width="140" height="36" rx="18" fill={INK} />
        <text x="94" y="48" fontSize="16" fontWeight="700" fill="#fff" textAnchor="middle">BEST SELLER</text>
        <text x="376" y="50" fontSize="22" fill="#f59e0b" textAnchor="end">★★★★★</text>
        <text x="200" y="382" fontSize="20" fontWeight="800" fill={INK} textAnchor="middle">Ridgeline 28L · $120</text>
      </>
    ),
  },
  // 9 · Trail Shoe Launch — product hero
  trailShoe: {
    ratio: [400, 400],
    alt: 'Static image: a trail running shoe on a muddy slope with the words The Switchback, grip for the wet days',
    draw: () => (
      <>
        <rect width="400" height="400" fill="#fef3c7" />
        <path d="M0 300 L400 220 V400 H0Z" fill="#92400e" />
        <path d="M0 330 L400 262 V400 H0Z" fill="#78350f" />
        <g transform="rotate(-11 200 220)">
          <path d="M96 236 q10 -70 66 -76 l34 44 q60 12 100 34 q18 10 14 30 h-214z" fill="#ea580c" />
          <path d="M96 236 h214 v14 q0 10 -12 10 h-190 q-12 0 -12 -10z" fill={INK} />
          <path d="M170 172 l26 34 M186 166 l26 36 M204 176 l20 28" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
          {[112, 142, 172, 202, 232, 262].map((x) => (
            <rect key={x} x={x} y="258" width="16" height="10" fill={INK} />
          ))}
        </g>
        <text x="28" y="64" fontSize="20" fontWeight="700" fill="#9a3412" letterSpacing="3">NEW</text>
        <text x="28" y="112" fontSize="44" fontWeight="900" fill={INK}>THE SWITCHBACK</text>
        <text x="28" y="372" fontSize="20" fontWeight="700" fill="#fff">Grip for the wet days · $89</text>
      </>
    ),
  },
  // 10 · Gift Guide Video — vertical video, wrapped gifts
  giftGuide: {
    ratio: [360, 640],
    alt: 'Vertical video frame: three wrapped gifts in a stack, captioned 6 gifts for people who go outside',
    draw: () => (
      <>
        <rect width="360" height="640" fill="#14532d" />
        <circle cx="300" cy="120" r="80" fill="#166534" />
        <circle cx="40" cy="520" r="110" fill="#166534" />
        <text x="180" y="110" fontSize="64" fontWeight="900" fill="#fff" textAnchor="middle">6 GIFTS</text>
        <text x="180" y="146" fontSize="18" fontWeight="700" fill="#bbf7d0" textAnchor="middle">FOR PEOPLE WHO GO OUTSIDE</text>
        <rect x="80" y="330" width="200" height="130" rx="8" fill="#dc2626" />
        <rect x="168" y="330" width="24" height="130" fill="#fde68a" />
        <rect x="80" y="384" width="200" height="22" fill="#fde68a" />
        <rect x="110" y="246" width="140" height="84" rx="8" fill="#f8fafc" />
        <rect x="170" y="246" width="20" height="84" fill="#dc2626" />
        <rect x="140" y="190" width="80" height="56" rx="8" fill="#facc15" />
        <rect x="174" y="190" width="12" height="56" fill="#14532d" />
        <path d="M180 190 q-28 -34 -34 -8 q0 14 34 8 q34 6 34 -8 q-6 -26 -34 8z" fill="#dc2626" />
      </>
    ),
  },
};

const FORMAT_LABEL = {
  image: 'Static image',
  video: 'Vertical video',
  carousel: 'Carousel',
  text: 'Search text ad',
  display: 'Display banner',
};

function Art({ art, className, slice = false }) {
  const spec = ART[art];
  if (!spec) return null;
  const [w, h] = spec.ratio;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={spec.alt}
      preserveAspectRatio={slice ? 'xMidYMid slice' : 'xMidYMid meet'}
      className={className}
      fontFamily="ui-sans-serif, system-ui, sans-serif"
    >
      {spec.draw()}
    </svg>
  );
}

// Small square for list rows. Text ads have no image, so they get a lettered tile.
export function CreativeThumb({ creative, className = 'w-12 h-12' }) {
  const box = `${className} shrink-0 rounded-md overflow-hidden border border-gray-200 bg-gray-100`;
  if (creative.art && ART[creative.art]) {
    return <div className={box}><Art art={creative.art} slice className="w-full h-full" /></div>;
  }
  if (creative.format === 'text' || creative.creative_type === 'text') {
    return (
      <div className={`${box} flex items-center justify-center text-[10px] font-semibold text-blue-700 bg-blue-50`} aria-label="Search text ad">
        Aa
      </div>
    );
  }
  if (creative.thumbnail_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={creative.thumbnail_url} alt="" className={`${box} object-cover`} />;
  }
  return <div className={box} aria-hidden="true" />;
}

const Avatar = () => (
  <div className="w-8 h-8 shrink-0 rounded-full bg-emerald-700 text-white text-sm font-bold flex items-center justify-center" aria-hidden="true">F</div>
);

function FeedFrame({ creative }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-xs">
      <div className="flex items-center gap-2 px-3 py-2">
        <Avatar />
        <div className="leading-tight">
          <div className="text-sm font-semibold text-gray-900">{creative.brand}</div>
          <div className="text-[11px] text-gray-500">Sponsored</div>
        </div>
      </div>
      {creative.primary_text && <p className="px-3 pb-2 text-sm text-gray-800">{creative.primary_text}</p>}
      <Art art={creative.art} className="w-full block" />
      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 border-t border-gray-200">
        <div className="min-w-0">
          <div className="text-[11px] uppercase text-gray-500 truncate">{creative.display_url}</div>
          <div className="text-sm font-semibold text-gray-900 truncate">{creative.headline}</div>
        </div>
        {creative.cta && (
          <span className="shrink-0 px-3 py-1.5 rounded-md bg-gray-200 text-xs font-semibold text-gray-900">{creative.cta}</span>
        )}
      </div>
    </div>
  );
}

function VideoFrame({ creative }) {
  return (
    <div className="relative mx-auto w-full max-w-[220px] rounded-2xl overflow-hidden bg-black shadow-xs">
      <Art art={creative.art} className="w-full block" />
      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-sm bg-black/50 text-[10px] font-medium text-white">
        0:{String(creative.video_seconds || 15).padStart(2, '0')}
      </div>
      <div className="absolute inset-x-0 bottom-0 p-3 bg-linear-to-t from-black/80 to-transparent text-white">
        <div className="text-xs font-semibold">
          @{String(creative.brand || '').toLowerCase()} <span className="ml-1 px-1 rounded-sm bg-white/25 text-[10px] font-medium">Sponsored</span>
        </div>
        {creative.primary_text && <p className="text-xs mt-1 leading-snug">{creative.primary_text}</p>}
        {creative.cta && (
          <div className="mt-2 rounded-md bg-white text-gray-900 text-xs font-semibold text-center py-1.5">{creative.cta}</div>
        )}
      </div>
    </div>
  );
}

function SearchFrame({ creative }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
      <div className="text-xs font-bold text-gray-900">Sponsored</div>
      <div className="flex items-center gap-2 mt-2">
        <Avatar />
        <div className="leading-tight min-w-0">
          <div className="text-sm text-gray-900">{creative.brand}</div>
          <div className="text-xs text-gray-500 truncate">{creative.display_url}</div>
        </div>
      </div>
      <div className="mt-2 text-lg leading-snug text-blue-800">{creative.headline}</div>
      {creative.primary_text && <p className="mt-1 text-sm text-gray-600">{creative.primary_text}</p>}
    </div>
  );
}

function DisplayFrame({ creative }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-xs">
      <div className="relative">
        <Art art={creative.art} className="w-full block" />
        <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-sm bg-white/90 text-[10px] font-semibold text-gray-600 border border-gray-200">Ad</span>
      </div>
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-gray-200">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">{creative.headline}</div>
          <div className="text-xs text-gray-500 truncate">{creative.primary_text}</div>
        </div>
        {creative.cta && (
          <span className="shrink-0 px-3 py-1.5 rounded-full bg-blue-600 text-xs font-semibold text-white">{creative.cta}</span>
        )}
      </div>
    </div>
  );
}

// The ad as a viewer would meet it, in a generic placement frame.
export default function CreativePreview({ creative }) {
  const hasArt = creative.art && ART[creative.art];
  let frame;
  if (creative.format === 'text') frame = <SearchFrame creative={creative} />;
  else if (!hasArt) {
    frame = (
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {creative.thumbnail_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={creative.thumbnail_url} alt={creative.headline || creative.name || 'Creative'} className="w-full block" />
          : <div className="aspect-square bg-gray-100 flex items-center justify-center text-sm text-gray-400">No preview synced</div>}
        {creative.headline && <div className="px-3 py-2 text-sm font-semibold text-gray-900 border-t border-gray-200">{creative.headline}</div>}
      </div>
    );
  } else if (creative.format === 'video') frame = <VideoFrame creative={creative} />;
  else if (creative.format === 'display') frame = <DisplayFrame creative={creative} />;
  else frame = <FeedFrame creative={creative} />;

  return (
    <figure className="m-0">
      {frame}
      <figcaption className="mt-2 text-xs text-gray-500">
        {[FORMAT_LABEL[creative.format], creative.placement].filter(Boolean).join(' · ')}
      </figcaption>
    </figure>
  );
}
