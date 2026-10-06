export function assertProductionBoundary(entry, inputs) {
  const paths = inputs.map((name) => name.replaceAll('\\', '/'));
  if (paths.some((name) => /(?:^|\/)(?:test|probe)\//.test(name)))
    throw new Error('Production bundle includes test or probe helpers');
  if (
    entry !== 'worker' &&
    paths.some((name) =>
      /oauth|(?:^|\/)(?:auth|github|google|connections|account-(?:page|actions)|browser-(?:login|sessions|cookies))\.ts$/.test(
        name,
      ),
    )
  )
    throw new Error('Storage bundle includes authorization-server code');
}
