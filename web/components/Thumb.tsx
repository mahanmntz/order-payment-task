import type { Product } from '@/lib/types';

/** Image with a gradient + initial fallback. */
export default function Thumb({ product, className = '' }: { product?: Pick<Product, 'name' | 'image'>; className?: string }) {
  if (product?.image) return <img className={`thumb ${className}`} src={product.image} alt={product.name} />;
  return <div className={`thumb fallback ${className}`}>{product?.name?.[0] ?? '?'}</div>;
}
