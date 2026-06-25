export type Kind =
  | "Number" | "Identifier"
  | "let" | "const" | "function" | "return" | "if" | "else"
  | "while" | "for" | "true" | "false"
  | "number" | "boolean" | "void"
  | "(" | ")" | "{" | "}" | ";" | "," | ":"
  | "+" | "-" | "*" | "/" | "%"
  | "=" | "===" | "!==" | "<" | "<=" | ">" | ">="
  | "&&" | "||" | "!"
  | "EOF";

export interface Token {
  kind: Kind;
  value: string;
  line: number;
  col: number;
}

export const KW: Record<string, Kind> = {
  let: "let", const: "const", function: "function", return: "return",
  if: "if", else: "else", while: "while", for: "for",
  true: "true", false: "false",
  number: "number", boolean: "boolean", void: "void",
};
