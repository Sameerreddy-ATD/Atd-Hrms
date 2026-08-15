import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "dist-server",
      ".output",
      ".vinxi",
      ".tanstack",
      "node_modules",
      "test-results",
      "playwright-report",
      "coverage",
      // Generated native shells: Gradle/CocoaPods outputs and the Capacitor
      // bridge are copied in by `cap sync`, not authored here.
      "android/app/build",
      "android/build",
      "ios/App/Pods",
      "ios/App/App/public",
      "mobile/.capacitor",
      "public/face-models",
      "src/routeTree.gen.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-useless-assignment": "off",
      "preserve-caught-error": "off",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true, allowExportNames: ["Route"] },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-namespace": "off",
    },
  },
  {
    files: ["src/routes/**/*.{ts,tsx}"],
    rules: {
      // TanStack Router route modules intentionally export route definitions beside components.
      "react-refresh/only-export-components": "off",
    },
  },
  eslintPluginPrettier,
);
