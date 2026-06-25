import { $ } from "bun";

export const findClang = () => Bun.which("clang");

export async function emitLL(ir: string, path: string) {
  await Bun.write(path, ir);
}

export async function compileToBinary(ll: string, out: string) {
  const clang = findClang();
  if (!clang) return { ok: false, stderr: "clang not found on PATH" };
  try {
    const r = await $`${clang} ${ll} -O2 -o ${out}`.quiet();
    return { ok: r.exitCode === 0, stderr: r.stderr.toString() };
  } catch (e) {
    const err = e as { stderr?: { toString(): string } };
    return { ok: false, stderr: err?.stderr?.toString() ?? String(e) };
  }
}
