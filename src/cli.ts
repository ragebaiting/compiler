import { lex } from "./lexer";
import { parse } from "./parser";
import { check } from "./checker";
import { codegen } from "./codegen";
import { emitLL, compileToBinary, findClang } from "./backend";
import { render, type Diag } from "./diagnostics";
import { $ } from "bun";
import { basename } from "node:path";

const report = (ds: Diag[], src: string) => ds.forEach(d => console.error(render(d, src)));

export async function run(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  if (!args.length) {
    console.error("usage: tsllvm <file.ts> [-o out] [--emit-llvm] [--run]");
    return 1;
  }

  let input = "", out = "", emit = false, exec = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "-o") out = args[++i] ?? "";
    else if (a === "--emit-llvm") emit = true;
    else if (a === "--run") exec = true;
    else input = a;
  }
  if (!input) { console.error("error: no input file"); return 1; }

  let src: string;
  try { src = await Bun.file(input).text(); }
  catch { console.error(`error: cannot read input file '${input}'`); return 1; }

  const stem = basename(input).replace(/\.ts$/, "");
  const ll = out && emit ? out : `${stem}.ll`;
  const exe = out && !emit ? out : process.platform === "win32" ? `${stem}.exe` : stem;

  const { tokens, diagnostics: lexed } = lex(src);
  if (lexed.length) return report(lexed, src), 1;
  const { program, diagnostics: parsed } = parse(tokens);
  if (parsed.length) return report(parsed, src), 1;
  const { diagnostics: typed } = check(program);
  if (typed.length) return report(typed, src), 1;

  await emitLL(codegen(program), ll);
  if (emit) { console.log(`wrote ${ll}`); return 0; }

  if (!findClang()) {
    console.error(`wrote ${ll}, but clang was not found on PATH.`);
    console.error("Install LLVM to produce a binary, e.g.: winget install LLVM.LLVM");
    return 2;
  }

  const res = await compileToBinary(ll, exe);
  if (!res.ok) { console.error("clang failed:\n" + res.stderr); return 1; }
  console.log(`wrote ${exe}`);

  return exec ? (await $`${"./" + exe}`.nothrow()).exitCode : 0;
}
