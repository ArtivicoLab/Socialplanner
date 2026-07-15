import { nanoid } from "nanoid";

export const newId = (): string => nanoid(12);

export const nowIso = (): string => new Date().toISOString();
