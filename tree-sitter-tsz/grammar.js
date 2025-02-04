/**
 * @file Toy language which transpiles to TS/JS
 * @author Alexander Schumacher
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />

const TypeScript = require("tree-sitter-typescript/typescript/grammar");

module.exports = grammar(TypeScript, {
  name: "tsz",
});
