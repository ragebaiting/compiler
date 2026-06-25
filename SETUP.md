# Setup — tsllvm

this turns a little bit of TypeScript into a real Windows `.exe`.

it happens in two steps:
1. your compiler (this project, runs on bun) turns `.ts` into `.ll`
2. clang (from llvm) turns the `.ll` into a `.exe`

step 1 needs nothing extra. step 2 needs llvm/clang.


## what you need

needs:
- bun  (runs the compiler) — already installed here (1.3.9)
- llvm - clang  (makes the real .exe) — NOT installed yet

that's the whole list. everything else is already set up.


## install llvm (the only missing thing)

open powershell and run:

```powershell
winget install LLVM.LLVM
```

it's a ~1 GB download. it puts clang in `C:\Program Files\LLVM\bin`.

heads up: after it finishes, close your terminal and open a new one.
already-open terminals won't see clang until you reopen them.

then check it worked:

```powershell
clang --version
```

you should see something like `clang version 20.x.x`.
if it says "clang is not recognized", jump to the bottom (stuck?).


## check bun (already done here)

```powershell
bun --version      # should say 1.3.9 or newer
```

if bun is ever missing (like on another pc):

```powershell
winget install Oven-sh.Bun
```

then open a new terminal.


## go to the project

```powershell
cd C:\Users\yeahy\Downloads\YEG
bun install        # already done — only needed if node_modules is gone
bun test           # 46 pass, 3 skip  (or 49 pass once clang is installed)
```

the 3 skips are the "make a real .exe and run it" tests.
they skip themselves when clang isn't around, and start passing once you install llvm.


## the main command

```powershell
bun run src/index.ts <file.ts> [options]
```

just look at the llvm code (no clang needed):

```powershell
bun run src/index.ts examples/fib.ts --emit-llvm
type fib.ll
```

make a real .exe (needs clang):

```powershell
bun run src/index.ts examples/fib.ts
.\fib.exe          # prints 55
```

make it and run it in one go:

```powershell
bun run src/index.ts examples/fib.ts --run
```

options:
- (nothing)      turn `name.ts` into `name.exe`
- `-o out.exe`   pick the output name
- `--emit-llvm`  stop at the `.ll` file (no clang needed)
- `--run`        compile, then run it


## try the examples

```powershell
bun run src/index.ts examples/fib.ts --run         # 55
bun run src/index.ts examples/factorial.ts --run   # 120
bun run src/index.ts examples/loops.ts --run       # 10
```


## write your own

make a file like `hello.ts`:

```ts
function square(x: number): number {
  return x * x;
}

let total = 0;
for (let i = 1; i <= 5; i = i + 1) {
  total = total + square(i);
}
print(total);   // 55
```

run it:

```powershell
bun run src/index.ts hello.ts --run
```

what the language can do:
- types: `number` (prints clean, like `5` and `5.5`) and `boolean`
- variables: `let` (can change) and `const`
- functions: typed params + return type, recursion, can call before they're written
- math: `+ - * / %`
- comparisons: `< <= > >= === !==`
- logic: `&& || !`
- control flow: `if/else`, `while`, c-style `for`
- output: `print(x)` where x is a number

what it can't do (yet):
strings, arrays, objects/classes, closures, `import`/`export`, `any`/unions.
every function that returns something has to `return` on every path, and
`return` only works inside a function. if you use something it doesn't know,
you get a clear error with the line and a `^` pointing right at it.


## stuck?

"clang is not recognized" after installing llvm
- close ALL terminals, open a fresh powershell window
- still broken? add it just for this session:
  ```powershell
  $env:Path += ";C:\Program Files\LLVM\bin"
  clang --version
  ```
- want to see where it is? `Get-Command clang`

"bun is not recognized"
- run `winget install Oven-sh.Bun`, then open a new terminal

a "type error" or "parse error" shows up
- that's the compiler doing its job — it's rejecting bad input.
  read the message, the `^` shows the exact spot.

"winget is not recognized"
- update "App Installer" from the microsoft store, or grab llvm by hand from
  https://github.com/llvm/llvm-project/releases
  (pick `LLVM-<version>-win64.exe` and tick "Add LLVM to the system PATH")


## the short version

```powershell
winget install LLVM.LLVM        # then OPEN A NEW TERMINAL
cd C:\Users\yeahy\Downloads\YEG
bun test                        # 49 pass once clang is found
bun run src/index.ts examples/fib.ts --run   # prints 55
```
