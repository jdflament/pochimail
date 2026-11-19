import { z } from "zod";

export const text = (v: unknown) => z.string().parse(v);
export const num = (v: unknown) => z.number().parse(v);
export const flag = (v: unknown) => v === 1;
export const json = (v: unknown) => JSON.parse(String(v)) as unknown;
export const orUndefined = <K extends string>(key: K, value: unknown) =>
  value === null || value === undefined ? {} : { [key]: value };
export const countRow = z.object({ value: z.number() });
