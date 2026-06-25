import type { Ann } from "./ast";

export type Type =
  | { kind: "number" } | { kind: "boolean" } | { kind: "void" }
  | { kind: "function"; params: Type[]; ret: Type };

export const tNumber: Type = { kind: "number" };
export const tBoolean: Type = { kind: "boolean" };
export const tVoid: Type = { kind: "void" };

export const toType = (a: Ann): Type =>
  a === "number" ? tNumber : a === "boolean" ? tBoolean : tVoid;

export function same(a: Type, b: Type): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "function" && b.kind === "function")
    return same(a.ret, b.ret)
      && a.params.length === b.params.length
      && a.params.every((p, i) => same(p, b.params[i]!));
  return true;
}

export const show = (t: Type): string =>
  t.kind === "function"
    ? `(${t.params.map(show).join(", ")}) => ${show(t.ret)}`
    : t.kind;
