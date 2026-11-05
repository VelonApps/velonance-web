import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import hooks from 'eslint-plugin-react-hooks'
export default tseslint.config({ignores:['dist','node_modules','coverage','*.log']}, js.configs.recommended, ...tseslint.configs.recommended, {files:['**/*.{ts,tsx}'],languageOptions:{globals:{...globals.browser,...globals.node}},plugins:{'react-hooks':hooks},rules:{'react-hooks/rules-of-hooks':'error','react-hooks/exhaustive-deps':'warn','@typescript-eslint/no-explicit-any':'error'}}, {files:['**/*.js','**/*.mjs'],languageOptions:{globals:globals.node}})
