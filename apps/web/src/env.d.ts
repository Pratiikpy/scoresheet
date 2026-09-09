/**
 * The build-time environment, typed.
 *
 * Vite replaces `import.meta.env.VITE_*` at build time with a literal, so the value is baked into
 * the bundle rather than read at runtime. Only `VITE_API` is declared, because only one thing here
 * is genuinely a deployment choice: whether the API is on this origin (production, and the default)
 * or on a box somewhere else (a dev build pointed at a server).
 *
 * Declared here rather than by pulling in `vite/client`, whose triple-slash reference also drags in
 * ambient module declarations for every asset type Vite can import — a large surface for one string.
 */
interface ImportMetaEnv {
  /** The API's origin, or empty for same-origin. */
  readonly VITE_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * `@nimiq/identicons`, which ships no types and whose `browser` entry is the wrong one.
 *
 * The package resolves `browser` to the 5 KB build that **fetches** its 88 KB sprite at runtime; the
 * bundle with the sprite inlined is only reachable by its exact path, which has no declaration file
 * beside it. Declaring the one method used here is smaller and more honest than an `any` cast at the
 * import, and it makes a signature change a type error rather than a face that stops drawing.
 */
declare module '@nimiq/identicons/dist/identicons.bundle.min.js' {
  const Identicons: {
    /** An SVG identicon for a Nimiq address. Deterministic, and pure. */
    svg: (address: string) => Promise<string>;
  };
  export default Identicons;
}
