import { expect, spyOn, test } from 'bun:test';

test('the portable gate selects script contracts without selecting historical author-input suites', async () => {
  const previousExitCode = process.exitCode;
  const spawn = spyOn(Bun, 'spawnSync').mockReturnValue({ exitCode: 0 } as ReturnType<typeof Bun.spawnSync>);
  try {
    await import('../test-portable');
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[1]![0]).toEqual(['node', 'packages/troy/scripts/test.mjs']);
    const [command] = spawn.mock.calls[0]!;
    expect(command).toContain('./scripts/tests/static-server.test.ts');
    expect(command).toContain('./scripts/tests/checks.test.ts');
    expect(command).toContain('./packages/scene-kit/tests/ui/browser-launch.test.ts');
    expect(command).not.toContain('./packages/foundry-floor/tests/unit/ff3-pack.test.ts');
    expect(command).not.toContain('./packages/farm/tests/unit/hand-clearance.test.ts');
    expect(command).not.toContain('./packages/foundry-floor/tests/unit/glb-world.test.ts');
    expect(command).not.toContain('./packages/golden-gate/tests/unit/vehicle-models.test.ts');
  } finally { spawn.mockRestore(); process.exitCode = previousExitCode; }
});
