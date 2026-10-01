interface ImportMetaEnv { readonly KILN_DEV: boolean; readonly KILN_TEST: boolean }
interface ImportMeta { readonly env: ImportMetaEnv }
declare module '*?inline' { const css: string; export default css; }
