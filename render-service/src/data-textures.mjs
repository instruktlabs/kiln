// Decoded glTF images -> DataTexture, for the service's WebGPU upload path.
//
// GLTFLoader's ImageBitmapLoader path yields the decoded bitmaps the renderer's
// createImageBitmap shim returns, which Dawn uploads as black; a DataTexture goes
// through writeTexture instead. The replacement must sample exactly as the loaded
// texture did, so it carries every sampling property the loader can set. No three
// import: the caller passes the namespace it renders with, so class identity holds.

/** Material slots GLTFLoader fills from a glTF core material. */
export const DATA_TEXTURE_SLOTS = Object.freeze([
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
]);

/** Replace every decoded-image texture under `root` with an equivalent DataTexture. */
export function toDataTextures(root, THREE) {
  root.traverse((o) => {
    for (const mat of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      for (const slot of DATA_TEXTURE_SLOTS) {
        const tex = mat[slot];
        if (tex?.image?.data && !tex.isDataTexture) {
          const dt = new THREE.DataTexture(
            tex.image.data,
            tex.image.width,
            tex.image.height,
            THREE.RGBAFormat,
          );
          dt.colorSpace = tex.colorSpace;
          dt.flipY = tex.flipY;
          dt.wrapS = tex.wrapS;
          dt.wrapT = tex.wrapT;
          dt.magFilter = tex.magFilter;
          // Which UV set, and KHR_texture_transform's offset/scale/rotation. GLTFLoader sets
          // `channel` from `texCoord` and from the transform's texCoord override.
          dt.channel = tex.channel;
          dt.offset.copy(tex.offset);
          dt.repeat.copy(tex.repeat);
          dt.rotation = tex.rotation;
          dt.center.copy(tex.center);
          dt.matrixAutoUpdate = tex.matrixAutoUpdate;
          dt.matrix.copy(tex.matrix);
          dt.minFilter = THREE.LinearMipmapLinearFilter;
          dt.generateMipmaps = true;
          dt.needsUpdate = true;
          mat[slot] = dt;
          mat.needsUpdate = true;
        }
      }
    }
  });
}
