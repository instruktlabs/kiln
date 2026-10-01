/**
 * Where the published docs and skills come from. Both must come from the same engine tree (engineering review,
 * finding 6): `KILN_SITE_DOCS_DIR` names the docs directory (default `../docs`, the repository's own), and
 * `KILN_SITE_SKILLS_DIR` names the skills directory, by default the docs directory's sibling `skills/`. Relative
 * values are resolved against `site/`, as the docs loader resolves them.
 */
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const fromSite = (value, site) => (isAbsolute(value) ? value : resolve(site, value));

/** @param {Record<string, string | undefined>} env */
export const docsDirectory = (env = process.env, site = SITE) => fromSite(env.KILN_SITE_DOCS_DIR || '../docs', site);

/** @param {Record<string, string | undefined>} env */
export const skillsDirectory = (env = process.env, site = SITE) =>
  env.KILN_SITE_SKILLS_DIR ? fromSite(env.KILN_SITE_SKILLS_DIR, site) : join(dirname(docsDirectory(env, site)), 'skills');
