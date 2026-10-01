// Small declarations for the Node-only staging/build surface; no extra installed type package.
declare module 'node:crypto' {
  interface Hash { update(data: Uint8Array | string): Hash; digest(encoding: 'hex'): string }
  export function createHash(algorithm: string): Hash;
}
declare module 'node:fs' {
  interface Dirent { name: string; isDirectory(): boolean; isSymbolicLink(): boolean; isFile(): boolean }
  interface Stats { size: number; isDirectory(): boolean; isSymbolicLink(): boolean; isFile(): boolean }
  export function readFileSync(path: string | URL): Uint8Array;
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
  export function writeFileSync(path: string | URL, data: string | Uint8Array): void;
  export function existsSync(path: string | URL): boolean;
  export function createReadStream(path: string | URL): { pipe<T>(destination: T): T };
  export function mkdirSync(path: string | URL, options?: { recursive?: boolean }): string | undefined;
  export function readdirSync(path: string | URL, options: { withFileTypes: true }): Dirent[];
  export function readdirSync(path: string | URL): string[];
  export function lstatSync(path: string | URL): Stats;
  export function statSync(path: string | URL): Stats;
  export function unlinkSync(path: string | URL): void;
  export function copyFileSync(source: string | URL, target: string | URL): void;
  export function cpSync(source: string | URL, target: string | URL, options?: { recursive?: boolean; force?: boolean }): void;
  export function rmSync(path: string | URL, options?: { recursive?: boolean; force?: boolean }): void;
}
declare module 'node:path' {
  export const sep: string;
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
  export function dirname(path: string): string;
  export function isAbsolute(path: string): boolean;
  export function extname(path: string): string;
  export function relative(from: string, to: string): string;
}
declare module 'node:url' { export function fileURLToPath(url: string | URL): string }
declare module 'node:assert/strict' {
  function assert(value: unknown, message?: string): asserts value;
  namespace assert {
    function equal(actual: unknown, expected: unknown, message?: string): void;
    function deepEqual(actual: unknown, expected: unknown, message?: string): void;
    function match(value: string, regexp: RegExp, message?: string): void;
  }
  export default assert;
}
declare module 'node:fs/promises' {
  export function mkdir(path: string | URL, options?: { recursive?: boolean }): Promise<string | undefined>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function readFile(path: string | URL): Promise<Uint8Array>;
  export function readFile(path: string | URL, encoding: 'utf8'): Promise<string>;
  export function writeFile(path: string | URL, value: string | Uint8Array): Promise<void>;
  export function readdir(path: string | URL): Promise<string[]>;
  export function realpath(path: string | URL): Promise<string>;
  export function stat(path: string | URL): Promise<{ size: number; isFile(): boolean; isDirectory(): boolean }>;
  export function rm(path: string | URL, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
}
declare module 'node:http' {
  interface Server {
    once(name: string, fn: (...args: any[]) => void): Server;
    off(name: string, fn: (...args: any[]) => void): Server;
    listen(port: number, host: string, fn: () => void): Server;
    closeIdleConnections?(): void;
    closeAllConnections?(): void;
    close(fn: (error?: Error) => void): void;
  }
  export function createServer(handler: (request: any, response: any) => void): Server;
}
declare module 'node:child_process' {
  interface ReadablePipe { on(name: 'data', callback: (bytes: Uint8Array) => void): ReadablePipe }
  export interface ChildProcess {
    pid: number | undefined; exitCode: number | null; killed: boolean; spawnargs: string[];
    stdout: ReadablePipe | null; stderr: ReadablePipe | null;
    once(name: 'close' | 'exit', callback: (code: number | null) => void): ChildProcess;
    once(name: 'error', callback: (error: Error) => void): ChildProcess;
    kill(signal?: string | number): boolean;
  }
  export function execFile(file: string, args: readonly string[], options: { timeout?: number }, callback: (error: Error | null, stdout: string, stderr: string) => void): ChildProcess;
  export function spawn(command: string, args: readonly string[], options: {
    cwd?: string; windowsHide?: boolean; stdio?: readonly string[]; env?: Record<string, string | undefined>;
  }): ChildProcess;
}

declare const process: { cwd(): string; pid: number; execPath: string; env: Record<string, string | undefined>; argv: string[]; exitCode?: number; platform: string; version: string; exit(code?: number): never };
declare module 'node:os' {
  interface CpuInfo { model: string; times: { user: number; nice: number; sys: number; idle: number; irq: number } }
  export function cpus(): CpuInfo[];
  export function release(): string;
  export function type(): string;
}

interface ImportMeta { readonly main?: boolean }
declare const Buffer: { from(data: Uint8Array | ArrayBuffer | string): Uint8Array };
