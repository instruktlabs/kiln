// Pinned pngjs7 synchronous surface used by local image-evidence scripts.
declare module 'pngjs' {
  interface Image { width: number; height: number; data: Uint8Array }
  export const PNG: { sync: { read(bytes: Uint8Array): Image; write(image: Image): Uint8Array } };
}
