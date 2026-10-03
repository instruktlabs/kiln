/** Host-only scene QA options. No shell parsing, browser download or production runtime policy. */
export function sceneBrowserOptions(options = {}, env = process.env) {
  const headed = env.KILN_SCENE_HEADED;
  if (options.headless === undefined && headed !== undefined && !['0', '1'].includes(headed)) {
    throw new Error('KILN_SCENE_HEADED must be 0 or 1');
  }
  let extra = [];
  if (env.KILN_SCENE_CHROME_ARGS !== undefined) {
    try { extra = JSON.parse(env.KILN_SCENE_CHROME_ARGS); }
    catch { throw new Error('KILN_SCENE_CHROME_ARGS must be a JSON array of browser flags'); }
    if (!Array.isArray(extra) || extra.some(flag => typeof flag !== 'string' || !flag.startsWith('--') || /[\u0000-\u001f]/.test(flag))) {
      throw new Error('KILN_SCENE_CHROME_ARGS must be a JSON array of browser flags');
    }
  }
  return { headless: options.headless ?? headed !== '1', args: [...extra, ...(options.args ?? [])] };
}
