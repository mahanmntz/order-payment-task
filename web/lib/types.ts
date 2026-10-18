export type Me = { id: string; email: string; role: 'user' | 'admin' };
export type Product = { _id: string; name: string; price: number; stock: number; isActive: boolean; image?: string };
export type OrderItem = { productId: string; name: string; price: number; quantity: number };
export type OrderStatus = 'Pending' | 'Paid' | 'Cancelled' | 'Failed';
export type Order = { _id: string; total: number; status: OrderStatus; items: OrderItem[]; createdAt: string };
export type PaymentInfo = { _id: string; orderId: string; amount: number; status: 'Pending' | 'Succeeded' | 'Failed' };
export type PayState = Record<string, { key: string; paymentId?: string }>;
export type LoadState = 'loading' | 'ready' | 'error';

export type ApiResult = { ok: boolean; status: number; data: any; message?: string; code?: string; replayed?: boolean };
export type Call = (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<ApiResult>;
export type ProviderBody = { paymentId: string; status: 'succeeded' | 'failed'; amount: number };
export type ProviderCall = (body: ProviderBody) => Promise<ApiResult>;
