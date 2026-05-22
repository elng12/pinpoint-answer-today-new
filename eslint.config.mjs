import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  {
    ignores: ["**/*.d.mts"],
  },
  ...compat.extends("next/core-web-vitals"),
  ...compat.plugins("@typescript-eslint"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "react/jsx-no-target-blank": "error",
    },
  },
];
