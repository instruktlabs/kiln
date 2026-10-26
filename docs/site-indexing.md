# Search indexing — September 6, 2026

The owner reported Search Console's “Duplicate without user-selected canonical”
warning for kilnstudio.tools. The domain property's report was inspected in the
owner's browser. Its six affected URLs were last crawled August 28–September 1,
before the current OSS site snapshot. Google's individual selected canonicals
were not inspected; the current live responses were checked for all six.

| Reported URL | Current first response | Current destination |
| --- | --- | --- |
| `https://www.kilnstudio.tools/` | 301 | Canonical HTTPS apex |
| `http://www.kilnstudio.tools/` | 301 | Canonical HTTPS apex |
| `https://play.kilnstudio.tools/` | 302 | GitHub Pages, then canonical HTTPS apex |
| `https://play.kilnstudio.tools/pocket-settlement` | 302 | Same redirect chain |
| `https://play.kilnstudio.tools/tower-defense` | 302 | Same redirect chain |
| `https://play.kilnstudio.tools/chess-board` | 302 | Same redirect chain |

All six end at a 200 HTML document declaring `https://kilnstudio.tools/` canonical.
Search Console accepted **Validate Fix** and showed **Validation started** on
September 6. This requests a fresh evaluation; it does not mean Google has finished
validation or indexed every duplicate. Analytics configuration was not changed.

## Live checks before this change

- `https://kilnstudio.tools/` returns 200 with exactly one static HTML canonical:
  `https://kilnstudio.tools/`.
- HTTP, `https://www.kilnstudio.tools/`, and the GitHub Pages project address
  redirect to that HTTPS apex URL.
- `/index.html` and a query-string variant return 200 and declare the same
  canonical root. They should consolidate into the root, not be indexed separately.
- `/robots.txt` and `/sitemap.xml` returned 404.

This change adds a crawl-allowing robots file referencing a sitemap that contains
only the canonical root. The existing canonical remains in the original HTML.
The account already had `/sitemap-index.xml` submitted from the old site, with an
error and zero discovered pages. That path is restored as a sitemap index pointing
to the new root sitemap, so Google's existing submission remains usable.
Hash routes such as `#/gallery` are views within one document; they are not listed
as separate crawlable pages or given fragment canonicals. Individually indexed
gallery pages would require real page URLs and distinct page content.

Google treats redirects and canonical links as strong signals and sitemap entries
as a weaker, complementary signal. A missing sitemap alone does not establish
the cause of this warning. Do not block duplicate URLs with robots.txt or add
`noindex` to the main page to try to solve canonical selection.

Reference: [Google's canonicalization guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).

## Remaining Search Console work

1. Allow Google to recrawl. Deployment cannot guarantee indexing or immediately
   clear the report. A duplicate excluded in favor of the intended root is normal.
2. If the report persists after a fresh crawl, inspect Google's selected canonical
   for the remaining examples. The retired `play` host could be simplified to a
   direct permanent redirect at its hosting configuration; that infrastructure
   is not owned by this GitHub Pages repository and was not changed here.

After deployment, the homepage, robots file, sitemap, and sitemap index all
returned 200. The existing sitemap index was resubmitted in Search Console, which
confirmed **Sitemap submitted successfully** and then **Success**, with its last
read on September 6. Discovered pages initially remained zero; processing and
indexing are separate from successful retrieval. No account permissions changed.

## Sitemap dates and pages.dev hosts — October 26, 2026

Live checks against build `238d1aa8` (the `main` head): all 329 sitemap URLs returned
200 with a self-referencing canonical on `https://kilnstudio.tools` and no `noindex`;
every share image returned 200 at 1200×630. The sitemap carried no `<lastmod>`, and
`kilnstudio.pages.dev` served the full site with no `X-Robots-Tag`. Preview aliases
already answered with `X-Robots-Tag: noindex`.

- `finalize-site` now writes a `<lastmod>` for every sitemap URL
  (`site/scripts/sitemap-lastmod.mjs`): the newest commit date among the files the
  page is built from (its Astro page, the local modules and data records it imports,
  and for a guide its Markdown). The shared base layout and site constants are not
  followed, so a navigation or version-label change does not redate every page.
  `validate-static` fails a sitemap URL without exactly one W3C Datetime `<lastmod>`.
- `_headers` sends `X-Robots-Tag: noindex` on `kilnstudio.pages.dev` and every
  `*.kilnstudio.pages.dev` alias, following Cloudflare's documented absolute-URL rule.
  The production host is unaffected; `validate-static` checks both.

Robots rules, canonicals and the noindex pages are unchanged.

## Retired scene-pack releases — October 26, 2026

Search Console reported 404s for files under scene-pack releases that production had
since replaced, for example `/scene-packs/golden-gate/g9/THIRD-PARTY-NOTICES.txt` and
`/scene-packs/foundry-floor/ff3-review2/licenses/ASSET-LICENSE.txt`. Earlier Pages
deployments show five retired releases were served: Golden Gate `g9` and `g9-code5`,
Foundry Floor `ff3-review2`, and Troy `troy-20261005-04` and `troy-20261005-06`.

`site/public/_redirects` moves each retired directory to its current release with a
`301` splat rule, for example `/scene-packs/golden-gate/g9/*` to
`/scene-packs/golden-gate/g9-code6/:splat`. Every Golden Gate and Foundry Floor file
keeps its name in the current release. Most Troy files do too; those that do not
redirect and then return 404: from `troy-20261005-04`, 24 per-revision source files
and 8 qualification pages (32 of 1,912), and from `troy-20261005-06`, 36 hashed bundle
chunks (of 1,937). `validate-static` checks that each rule is a 301 splat move, that no built file
sits under a retired directory, that each target directory has files (in a packs
build; the reduced `KILN_SITE_PACKS=0` build has no scene packs), and that no target
is itself redirected. Asset JSON and GLB 404s and the retired `play.` hosts
are left alone.
