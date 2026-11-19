# How Kiln isolates evaluated code

A Kiln asset is a JavaScript program that a model or a person wrote. Kiln runs it to
build a scene and export a GLB. This page states where that program runs, what it can
reach and where the limits are, so a reviewer can cite it. Each claim names the source
file it rests on. Kiln does not claim a complete security sandbox for the default local
modes; read [limits](#limits) before running a program you do not trust.

Report a vulnerability by the [security policy](https://github.com/instruktlabs/kiln/blob/main/SECURITY.md).

## What runs

The program is a string. Kiln does not install or `import` anything the program names.

1. **Static check** (`assertGeneratedSourceSafe` in `src/validation.ts`). The source is
   parsed as a strict-mode script with acorn. A script cannot contain `import`
   declarations, and the check rejects dynamic `import()`, the identifiers
   `globalThis`, `global`, `process`, `fetch`, `XMLHttpRequest`, `WebSocket`, `Function`,
   `eval`, `window`, `self`, `document`, `navigator`, `location`, `Bun`, `Deno`,
   `Reflect`, `require`, `module`, top-level `this`, `.constructor` chains, and the raw
   three.js constructors `DataTexture`, `ShaderMaterial` and `RawShaderMaterial`. The
   source comments call this a denylist safety net, not isolation.
2. **Execution** (`executeKilnCode` in `src/render.ts`). The source is wrapped in
   `new Function(...)` in strict mode. Its only free variables are the keys of the object
   `buildSandboxGlobals` returns: the documented authoring helpers, three.js, a console
   wrapper, and `loadApprovedTexture(resourceId)`. `new Function`
   runs in the host's own realm and process. It is a name-scoping mechanism, not a
   separate realm, so the static check in step 1 is what keeps the program from reaching
   `process` or `require` by name.
3. **Texture bytes** come only through `loadApprovedTexture`, which takes one resource ID
   string and calls a resolver the host installed (`src/primitives.ts`). The program never
   receives the resolver, a path or a file handle.

## Where it runs

`KILN_EVALUATOR_MODE` selects the process boundary (`src/local-runtime.ts`).

| Mode | Where the program runs | Boundary |
| --- | --- | --- |
| `subprocess` (default for the CLI and MCP server) | A separate Node process started for the request (`src/evaluator/subprocess.ts`) | A process, not a sandbox |
| `isolated` | The same worker inside a Linux user, PID, network, mount, IPC, UTS and cgroup namespace (`src/evaluator/isolation.ts`) | Kernel namespaces, when the host qualifies them |
| `in-process` | The host process | None. It is for trusted code and has no deadline |

### Subprocess mode

The worker is started with the host's own `node` and `--max-old-space-size` (512 MiB by
default). The request goes in on stdin and is capped; the result comes back on file
descriptor 3. The worker's stdout is discarded and its stderr is kept to 16 KiB.

- **Environment.** The worker gets `NODE_ENV`, `NO_COLOR` and only the host's `PATH`, `Path`,
  `SystemRoot`, `SYSTEMROOT`, `TEMP`, `TMP` and `TZ` (`sanitizedEvaluatorEnv`). Provider
  keys and other variables in the host's environment are not passed on.
- **Limits.** A 60-second deadline ends the process with SIGKILL (the process group on
  POSIX in isolated mode), the GLB is capped at 16 MiB and the response at 32 MiB by default, and host
  cancellation reaches the worker.
- **What it does not restrict.** The launch has no `cwd` override, no Node permission
  flags, no container and no namespace. The worker runs with the operating-system rights
  of the user who started the host and the host's working directory. The static check
  and the closed globals are the only things that stop a program from using them.

### Isolated mode

Linux only: on any other platform it fails with `ISOLATION_UNAVAILABLE` and never runs the
program elsewhere. The launch (`isolatedEvaluatorLaunch`) is:

- `setpriv --no-new-privs` with inheritable and ambient capabilities cleared;
- `bwrap --unshare-all --unshare-user --disable-userns --cap-drop ALL --clearenv --new-session --die-with-parent`,
  so the worker has no network interfaces and an environment of exactly two variables;
- read-only mounts of `/usr`, `/lib`, `/lib64` and the installed `node_modules` only, plus a
  `tmpfs` at `/tmp`, so the host filesystem, the workspace and credentials are not visible;
- `prlimit` caps of 65 s CPU, 6 GiB address space, 96 MiB file size, 64 open files and 64
  processes;
- `node --disable-proto=delete`.

A host proves the boundary with `assertIsolatedEvaluatorReady`, exported from
`@instruktlabs/kiln/evaluator`. It refuses to run as root, then starts the worker's probe
inside the same launch (`src/evaluator/probe-invariants.ts`) and checks the namespace,
no-new-privileges, empty capabilities, the exact environment, denied host and product
filesystem, a read-only runtime, an empty network namespace and denied metadata and local
network addresses. A failed check is `ISOLATION_UNAVAILABLE`, not a fallback. Rendering
itself does not repeat the probe, so a host should call it at start-up. The adversarial suite in `src/evaluator/isolation-adversarial.test.ts` covers
filesystem, environment, network and process acquisition and resource exhaustion.

The runtime root is fixed at `/app` and the tools at fixed paths, so this mode is built for
a prepared container image. Each hosting environment must qualify it; passing the probes on
one machine says nothing about another.

## Limits

- **Default local modes are not a security sandbox.** A subprocess is terminable and
  bounded in time, size and V8 heap. It is not isolated from the user's files, network or
  other processes. The heap cap does not bound native allocations or total process memory.
- **The static check is a denylist.** It has rejected the patterns above, and it is not a
  proof that no other path to the host exists in a given Node or three.js version.
- **Opt-in isolation is Linux only** and depends on `bwrap`, `setpriv` and `prlimit` and on
  user namespaces being allowed by the host.
- **Output is data, not trust.** A program can produce a large or misleading asset. Size
  and time limits bound it, and QA findings describe the geometry, not the author's intent.
- **The render service is separate.** GPU views render a self-contained GLB the evaluator
  already produced; the program is never executed there.

Run programs you do not trust only in `isolated` mode on a qualified Linux host, or in your
own container or virtual machine with no credentials. Details and the environment variables
are in the [runtime contract](runtime.md#local-defaults) and the [SDK](sdk.md#execution-and-dependencies).
