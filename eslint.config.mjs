import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // src/bracket is being prepared as a standalone package. App code may only
  // use its public entry points, and the module may not reach into the app.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/bracket/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/bracket/*", "!@/bracket/core", "**/bracket/*", "!**/bracket/core"],
          message: "Import the bracket module from '@/bracket' or '@/bracket/core' only.",
        }],
      }],
    },
  },
  {
    files: ["src/bracket/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/*", "../*"],
          message: "The bracket module must stay self-contained; it cannot import app code.",
        }],
      }],
    },
  },
  {
    files: ["src/bracket/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/*", "../*", "react", "react-dom", "next", "next/*"],
          message: "bracket/core must stay framework-free so server code can import it.",
        }],
      }],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
