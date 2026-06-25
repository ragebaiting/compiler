export interface Diag {
  stage: string;
  message: string;
  line: number;
  col: number;
}

export function render(d: Diag, src: string): string {
  const line = src.split(/\r?\n/)[d.line - 1] ?? "";
  const caret = " ".repeat(Math.max(0, d.col - 1)) + "^";
  return `${d.stage} error (${d.line}:${d.col}): ${d.message}\n  ${line}\n  ${caret}`;
}
