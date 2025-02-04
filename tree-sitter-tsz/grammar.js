/**
 * @file Toy language which transpiles to TS/JS
 * @author Alexander Schumacher
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />

const TypeScript = require("tree-sitter-typescript/typescript/grammar");

// TODO: migrate scanner from typescript grammar to solve undefined symbol errors
// @see https://github.com/tree-sitter/tree-sitter-typescript/blob/master/typescript/src/scanner.c
// @see https://github.com/tree-sitter/tree-sitter-typescript/blob/master/common/scanner.h
// module.exports = grammar(TypeScript, {
//   name: "tsz",

//   rules: {
//     // TODO: add the actual grammar rules
//     source_file: $ => 'hello'
//   }
// });

module.exports = grammar({
  name: 'tsz',

  rules: {
    // TODO: add the actual grammar rules
    source_file: $ => 'hello'
  }
});