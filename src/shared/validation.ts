import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const money = z.number().int().min(0); // integer minor units, never negative
