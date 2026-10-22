/**
 * KTX2 encoding through the optional `ktx2-encoder` peer (#201).
 *
 * `ktx2-encoder` (MIT) bundles a precompiled Basis Universal encoder (Apache-2.0, with
 * Zstandard under BSD-3-Clause) as WebAssembly and ships its own THIRD_PARTY_NOTICES.md.
 * Kiln neither bundles nor redistributes it: users install the exact peer themselves, and
 * every bundle keeps it external. Loaded lazily, only when KTX2 is requested.
 *
 * Modes are chosen per slot: ETC1S for colour (base colour and emissive, sRGB transfer), UASTC
 * with Zstandard supercompression for normal and other linear data. Settings are fixed and
 * recorded in the encoder identity, which the runtime sidecar and receipt repeat.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type {
  RuntimeThreeKtx2EncoderIdentityV1,
  RuntimeThreeKtx2EncoderV1,
  RuntimeThreeKtx2InputV1,
} from './runtime-three';

/** The exact peer Kiln is qualified with. */
export const KTX2_ENCODER_PACKAGE = Object.freeze({ name: 'ktx2-encoder', version: '0.6.0' });
const INSTALL = `npm install ${KTX2_ENCODER_PACKAGE.name}@${KTX2_ENCODER_PACKAGE.version}`;

type ImageDecoder = (
  buffer: Uint8Array,
) => Promise<{ data: Uint8Array; width: number; height: number }>;
type EncodeOptions = Record<string, unknown> & { imageDecoder: ImageDecoder };
interface Ktx2EncoderModule {
  encodeToKTX2(image: Uint8Array, options: EncodeOptions): Promise<Uint8Array>;
}
/** The package's own internals (0.6.0 layout), loaded by file URL past its exports map. */
interface BasisFactory {
  default(module: { print(text: string): void; printErr(text: string): void }): Promise<{
    initializeBasis(): void;
  }>;
}
interface EncodeCore {
  encodeWithModule(basis: unknown, image: Uint8Array, options: EncodeOptions): Promise<Uint8Array>;
}

/** Fixed encoder options, by profile. Option names are the package's own. */
const SETTINGS = Object.freeze({
  srgb: Object.freeze({
    mode: 'etc1s',
    isUASTC: false,
    qualityLevel: 128,
    compressionLevel: 2,
    generateMipmap: true,
    isSetKTX2SRGBTransferFunc: true,
    isPerceptual: true,
  }),
  linear: Object.freeze({
    mode: 'uastc',
    isUASTC: true,
    uastcLDRQualityLevel: 2,
    needSupercompression: true,
    generateMipmap: true,
    isSetKTX2SRGBTransferFunc: false,
    isPerceptual: false,
  }),
  normal: Object.freeze({
    mode: 'uastc',
    isUASTC: true,
    uastcLDRQualityLevel: 2,
    needSupercompression: true,
    generateMipmap: true,
    isSetKTX2SRGBTransferFunc: false,
    isPerceptual: false,
    isNormalMap: true,
  }),
});
const profile = (input: RuntimeThreeKtx2InputV1) =>
  input.colorSpace === 'srgb'
    ? SETTINGS.srgb
    : input.slot === 'normal'
      ? SETTINGS.normal
      : SETTINGS.linear;

const hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** The installed package directory, from its resolved entry. */
async function packageDirectory(): Promise<string> {
  let directory = dirname(fileURLToPath(import.meta.resolve(KTX2_ENCODER_PACKAGE.name)));
  for (let depth = 0; depth < 6; depth++) {
    try {
      const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      if (manifest.name === KTX2_ENCODER_PACKAGE.name) return directory;
    } catch {
      /* Keep walking up. */
    }
    directory = dirname(directory);
  }
  throw new Error(`Cannot locate the installed ${KTX2_ENCODER_PACKAGE.name} package`);
}

/**
 * Import the optional peer and read its identity. A missing peer fails with the exact install
 * command; another version is refused, because the settings above are qualified on 0.6.0.
 */
export async function loadKtx2Encoder(
  importer: () => Promise<unknown> = () => import('ktx2-encoder'),
): Promise<{
  encode: (image: Uint8Array, options: EncodeOptions) => Promise<Uint8Array>;
  version: string;
  basisWasmSha256?: string;
}> {
  let module: Ktx2EncoderModule;
  try {
    module = (await importer()) as Ktx2EncoderModule;
  } catch (error) {
    throw new Error(
      `KTX2 encoding needs the optional peer ${KTX2_ENCODER_PACKAGE.name}@${KTX2_ENCODER_PACKAGE.version}. Install it with: ${INSTALL}`,
      { cause: error },
    );
  }
  if (typeof module?.encodeToKTX2 !== 'function')
    throw new Error(`${KTX2_ENCODER_PACKAGE.name} has no encodeToKTX2 export. ${INSTALL}`);
  const directory = await packageDirectory();
  const { version } = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  if (version !== KTX2_ENCODER_PACKAGE.version)
    throw new Error(
      `${KTX2_ENCODER_PACKAGE.name} ${version} is installed; Kiln's KTX2 settings are qualified on ${KTX2_ENCODER_PACKAGE.version}. ${INSTALL}`,
    );
  let basisWasmSha256: string | undefined;
  try {
    basisWasmSha256 = `sha256:${hex(await readFile(join(directory, 'dist', 'basis', 'basis_encoder.wasm')))}`;
  } catch {
    /* The identity then omits the WebAssembly hash. */
  }
  // The package's Node entry starts Basis with the default print, and Basis writes progress to
  // stdout even with debug off, which would corrupt `--json` output. Start the same bundled
  // WebAssembly with its output silenced, and use the package's own encode routine.
  const internal = (path: string) => import(pathToFileURL(join(directory, 'dist', path)).href);
  const [factory, core] = (await Promise.all([
    internal('basis/basis_encoder.js'),
    internal('encodeCore.js'),
  ])) as [BasisFactory, EncodeCore];
  if (typeof factory.default !== 'function' || typeof core.encodeWithModule !== 'function')
    throw new Error(`${KTX2_ENCODER_PACKAGE.name} ${version} has an unexpected layout. ${INSTALL}`);
  basis ??= factory.default({ print: () => {}, printErr: () => {} }).then((instance) => {
    instance.initializeBasis();
    return instance;
  });
  const instance = basis;
  return {
    encode: async (image, options) => core.encodeWithModule(await instance, image, options),
    version,
    ...(basisWasmSha256 ? { basisWasmSha256 } : {}),
  };
}
let basis: Promise<unknown> | undefined;

/** Decode PNG, JPEG or WebP to RGBA for the encoder, with Kiln's existing sharp. */
const decode: ImageDecoder = async (buffer) => {
  const { default: sharp } = await import('sharp');
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};

/**
 * A `ktx2Encoder` for `exportAssetGlb` / `deliverThreeRuntimeGlb`: ETC1S for colour, UASTC for
 * normal and data maps, with its identity attached for the delivery receipt.
 */
export async function createKtx2Encoder(
  options: { importer?: () => Promise<unknown> } = {},
): Promise<RuntimeThreeKtx2EncoderV1 & { identity: RuntimeThreeKtx2EncoderIdentityV1 }> {
  const { encode: run, version, basisWasmSha256 } = await loadKtx2Encoder(options.importer);
  const identity: RuntimeThreeKtx2EncoderIdentityV1 = {
    name: KTX2_ENCODER_PACKAGE.name,
    version,
    ...(basisWasmSha256 ? { basisWasmSha256 } : {}),
    settings: structuredClone({ ...SETTINGS }),
  };
  const encode = async (input: RuntimeThreeKtx2InputV1) => {
    const { mode: _mode, ...settings } = profile(input);
    return run(input.image, { ...settings, imageDecoder: decode });
  };
  return Object.assign(encode, { identity });
}
