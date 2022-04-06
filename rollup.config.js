import { terser } from "rollup-plugin-terser";

export default [
  {
    input: "compiled/index.js",
    output: {
      file: "dist/matija-js.js",
      format: "es"
    }
  },
  {
    input: "compiled/index.js",
    output: {
      file: "dist/matija-js.min.js",
      format: "es"
    },
    plugins: [terser()]
  }
];
