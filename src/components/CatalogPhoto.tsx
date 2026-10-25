import { useState } from 'react'

export default function CatalogPhoto({ src, alt, className = '' }: { src?: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (src && failed !== src) return <img className={className} src={src} alt={alt} loading="lazy" draggable={false} onError={() => setFailed(src)} />
  return <span className={`catalog-photo-placeholder ${className}`} role="img" aria-label={`${alt} 사진 없음`}><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M10 8v10c0 5 10 5 10 0V8M15 8v32M34 8c-8 6-8 17 0 17v15M34 8v17" /></svg></span>
}
