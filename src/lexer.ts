import type { Token, Kind } from "./token";
import { KW } from "./token";
import type { Diag } from "./diagnostics";

const digit = (c: string) => c >= "0" && c <= "9";
const alpha = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_" || c === "$";
const alnum = (c: string) => alpha(c) || digit(c);

const OPS = ["===", "!==", "<=", ">=", "&&", "||"] as const;

const PUNCT: Record<string, Kind> = {
  "(": "(", ")": ")", "{": "{", "}": "}", ";": ";", ",": ",", ":": ":",
  "+": "+", "-": "-", "*": "*", "/": "/", "%": "%",
  "=": "=", "<": "<", ">": ">", "!": "!",
};

export function lex(src: string): { tokens: Token[]; diagnostics: Diag[] } {
  const toks: Token[] = [];
  const diags: Diag[] = [];
  let i = 0, line = 1, col = 1;

  const peek = (k = 0) => src[i + k] ?? "";
  const eat = () => {
    const c = src[i++]!;
    if (c === "\n") { line++; col = 1; } else col++;
    return c;
  };
  const emit = (kind: Kind, value: string, l: number, c: number) => toks.push({ kind, value, line: l, col: c });

  while (i < src.length) {
    const c = peek();
    if (c === " " || c === "\t" || c === "\r" || c === "\n") { eat(); continue; }
    if (c === "/" && peek(1) === "/") { while (i < src.length && peek() !== "\n") eat(); continue; }
    if (c === "/" && peek(1) === "*") {
      eat(); eat();
      while (i < src.length && !(peek() === "*" && peek(1) === "/")) eat();
      eat(); eat(); continue;
    }

    const l = line, c0 = col;

    if (digit(c)) {
      let s = "";
      while (digit(peek())) s += eat();
      if (peek() === "." && digit(peek(1))) { s += eat(); while (digit(peek())) s += eat(); }
      emit("Number", s, l, c0); continue;
    }
    if (alpha(c)) {
      let s = "";
      while (alnum(peek())) s += eat();
      emit(KW[s] ?? "Identifier", s, l, c0); continue;
    }

    const op = OPS.find(o => src.startsWith(o, i));
    if (op) { for (let k = 0; k < op.length; k++) eat(); emit(op, op, l, c0); continue; }
    if (PUNCT[c] !== undefined) { eat(); emit(PUNCT[c]!, c, l, c0); continue; }

    diags.push({ stage: "lex", message: `unexpected character '${c}'`, line: l, col: c0 });
    eat();
  }

  toks.push({ kind: "EOF", value: "", line, col });
  return { tokens: toks, diagnostics: diags };
}
