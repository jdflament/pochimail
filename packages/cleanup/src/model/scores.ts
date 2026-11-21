import { z } from "zod";

export const confidenceSchema = z.number().min(0).max(1);
export const reasonsSchema = z.array(z.string().min(1)).min(1);
