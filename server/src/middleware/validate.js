import mongoose from 'mongoose';
import { z } from 'zod';
import { badRequest } from '../utils/errors.js';

export const objectId = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v) && /^[a-f\d]{24}$/i.test(v), 'Invalid id');

// Parses `source` with `schema`, throwing a 400 with field details on failure.
export function parse(schema, source) {
  const result = schema.safeParse(source ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw badRequest(details[0]?.message || 'Invalid request.', details);
  }
  return result.data;
}
