/**
 * @file Toy language which transpiles to TS/JS
 * @author Alexander Schumacher
 * @license MIT
 * 
 * Huge chunks of the grammar are taken from the JavaScript & TypeScript grammars.
 * @see https://github.com/tree-sitter/tree-sitter-javascript/blob/master/grammar.js
 * @see https://github.com/tree-sitter/tree-sitter-typescript/blob/master/common/define-grammar.js
 * 
 * tsz purposefully does not support the whole of JS and TS,
 * but only a subset of it, to reduce the complexity of the grammar and the
 * amount of code that needs to be written to support the language.
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

module.exports = grammar({
  name: 'tsz',

  externals: $ => [
    $._template_chars,
    $.html_comment,
    '||',
    // We use escape sequence and regex pattern to tell the scanner if we're currently inside a string or template string, in which case
    // it should NOT parse html comments.
    $.escape_sequence,
    $.regex_pattern,
  ],

  extras: $ => [
    $.comment,
    $.html_comment,
    /[\s\p{Zs}\uFEFF\u2028\u2029\u2060\u200B]/, // required for comments to be parsed correctly
  ],

  precedences: $ => [
    [
      $.if_ternary_expression,
      $.binary_expression,
      $.member_expression,
    ],
    [
      'member',
      'call',
      'binary_exp',
      'binary_times',
      'binary_plus',
      'binary_shift',
      'binary_compare',
      'binary_relation',
      'binary_equality',
      'bitwise_and',
      'bitwise_xor',
      'bitwise_or',
      'logical_and',
      'logical_or',
      'ternary',
      $.arrow_function_expression,
    ],
  ],

  conflicts: $ => [
    [$.call_expression, $.expression],
    [$._assignment_identifier, $.member_expression],
  ],

  word: $ => $.identifier,

  supertypes: $ => [
    $.statement,
    $.expression,
    $.type,
  ],

  rules: {
    program: $ => repeat($.statement),
    
    statement: $ => choice(
      $.function_declaration,
      $.variable_declaration,
      $.return_statement,
      $.call_statement,
      $.switch_expression,
      $.block_statement,
      $.variable_assignment,
      $.enum_declaration,
      $.if_statement,
      $.break_statement,
      $.continue_statement,
    ),

    break_statement: $ => seq(
      'break',
      ';',
    ),

    continue_statement: $ => seq(
      'continue',
      ';',
    ),

    block_statement: $ => seq(
      '{',
      repeat($.statement),
      '}',
    ),

    if_statement: $ => seq(
      'if',
      field('condition', $.parenthesized_expression),
      field('consequence', $.block_statement),
      optional(seq(
        'else',
        field('alternative', choice(
          $.block_statement,
          $.if_statement,
        )),
      )),
    ),

    parenthesized_expression: $ => seq(
      '(',
      $.expression,
      ')',
    ),

    switch_expression: $ => seq(
      'switch',
      field('value', $.parenthesized_expression),
      field('body', seq(
        '{',
        repeat($.switch_case),
        optional($.switch_else),
        '}',
      )),
    ),
    
    switch_case: $ => seq(
      'case',
      field('condition', $.expression),
      ':',
      field('consequence', choice(
        $.block_statement,
        $.expression,
      )),
      ';',
    ),

    switch_else: $ => seq(
      'else',
      ':',
      field('consequence', choice(
        $.block_statement,
        $.expression,
      )),
      ';',
    ),

    function_declaration: $ => seq(
      'function',
      $.identifier,
      $.argument_list_declaration,
      ':',
      field('return_type', $.type),
      field('body', $.block_statement),
    ),

    variable_declaration: $ => seq(
      $._declaration_kind,
      field('name', $.identifier),
      optional(field('type', $.type_annotation)),
      optional(seq('=',
        field('value', $.expression)
      )),
      ';',
    ),

    enum_member: $ => seq(
      $.identifier,
      optional(seq('=', field('value', $._enum_value))),
    ),

    enum_declaration: $ => seq(
      'enum',
      $.identifier,
      '{',
      commaSep1($.enum_member),
      optional(','),
      '}',
    ),

    argument_declaration: $ => seq(
      optional(field('spread', '...')),
      field('name', $.identifier),
      field('type', $.type_annotation),
    ),

    argument_list_declaration: $ => seq(
      '(',
      commaSep(optional($.argument_declaration)),
      ')',
    ),

    type_annotation: $ => seq(
      ':',
      $.type,
    ),

    union_type: $ => prec.left(seq(optional($.type), '|', $.type)),

    or_undefined_type: $ => seq($.type, '?'),

    type: $ => choice(
      alias($.identifier, $.type_identifier),
      $.primitive_type,
      $.array_type,
      $.tuple_type,
      $.union_type,
      $.or_undefined_type,
    ),

    primitive_type: $ => choice(
      'boolean',
      'number',
      'string',
      'void',
      'any',
      'unknown',
      $.undefined,
      $.true,
      $.false,
      'never',
      'symbol',
      // 'object', TBD
    ),
  
    array_type: $ => seq(
      $.type,
      '[',
      ']',
    ),

    tuple_type: $ => seq(
      '[',
      commaSep($.type),
      optional(','),
      ']',
    ),

    call_statement: $ => seq(
      $.call_expression,
      ';',
    ),

    return_statement: $ => seq(
      'return',
      $.expression,
      ';'
    ),

    call_expression: $ => seq(
      choice(
        prec('call', seq(
          field('function', $._call_expression_function_identifier),
          field('arguments', $.arguments),
        )),
        // prec('template_call', seq(
        //   field('function', choice($.primary_expression, $.new_expression)),
        //   field('arguments', $.template_string),
        // )),
        prec('member', seq(
          field('function', $._call_expression_function_identifier),
          field('optional_chain', $.optional_chain),
          field('arguments', $.arguments),
        )),
      ),
    ),

    _assignment_identifier: $ => choice(
      $.identifier,
      $.member_expression,
    ),

    _enum_value: $ => choice(
      $.number,
      alias($._number, $.unary_expression),
      $.string,
    ),

    _call_expression_function_identifier: $ => choice(
      $._assignment_identifier,
      $.comptime_identifier,
      $.number,
      $.string,
      $.array_literal,
      $.object_literal,
      $.regex,
    ),

    arguments: $ => seq(
      '(',
      commaSep(optional(choice($.expression, $.spread_argument))),
      ')',
    ),

    spread_argument: $ => seq('...', $.expression),

    function_expression: $ => seq(
      'function',
      $.argument_list_declaration,
      ':',
      field('return_type', $.type),
      field('body', $.block_statement),
    ),

    arrow_function_expression: $ => seq(
      $.argument_list_declaration,
      ':',
      field('return_type', $.type),
      '=>',
      field('body', choice(
        $.block_statement,
        $.expression,
      )),
    ),

    if_ternary_expression: $ => seq(
      'if',
      field('condition', $.parenthesized_expression),
      field('consequence', $.expression),
      'else',
      field('alternative', $.expression),
    ),

    // TODO: rework this mess to be more coherent
    // Split things that can be anywhere and stuff that has to be at the top level
    expression: $ => choice(
      $._call_expression_function_identifier,
      alias($._number, $.unary_expression),
      $.call_expression,
      $.function_expression,
      $.arrow_function_expression,
      $.binary_expression,
      $.template_string,
      $.true,
      $.false,
      $.undefined,
      $.if_ternary_expression,
      // $.switch_expression,
    ),

    binary_expression: $ => choice(
      ...[
        ['&&', 'logical_and'],
        ['||', 'logical_or'],
        ['>>', 'binary_shift'],
        ['>>>', 'binary_shift'],
        ['<<', 'binary_shift'],
        ['&', 'bitwise_and'],
        ['^', 'bitwise_xor'],
        ['|', 'bitwise_or'],
        ['+', 'binary_plus'],
        ['-', 'binary_plus'],
        ['*', 'binary_times'],
        ['/', 'binary_times'],
        ['%', 'binary_times'],
        ['**', 'binary_exp', 'right'],
        ['<', 'binary_relation'],
        ['<=', 'binary_relation'],
        // ['==', 'binary_equality'], // not allowed in tsz
        ['===', 'binary_equality'],
        // ['!=', 'binary_equality'], // not allowed in tsz
        ['!==', 'binary_equality'],
        ['>=', 'binary_relation'],
        ['>', 'binary_relation'],
        ['??', 'ternary'],
        ['instanceof', 'binary_relation'],
        ['in', 'binary_relation'],
      ].map(([operator, precedence, associativity]) =>
        (associativity === 'right' ? prec.right : prec.left)(precedence, seq(
          field('left', operator === 'in' ? choice($.expression, $.private_property_identifier) : $.expression),
          field('operator', operator),
          field('right', $.expression),
        )),
      ),
    ),

    variable_assignment: $ => seq(
      field('assignee', $._assignment_identifier),
      '=',
      field('value', $.expression),
      ';',
    ),

    optional_chain: _ => '?.',

    member_expression: $ => prec('member', seq(
      field('object', choice($.expression, $.member_expression)),
      choice('.', field('optional_chain', $.optional_chain)),
      field('property', choice(
        $.private_property_identifier,
        alias($.identifier, $.property_identifier))),
    )),

    identifier: $ => /[a-zA-Z_][a-zA-Z0-9_]*/,
    private_property_identifier: $ => seq('#', $.identifier),
    comptime_identifier: $ => seq('@', $.identifier),

    _declaration_kind: $ => choice(
      $.const,
      $.let,
    ),

    // https://github.com/tree-sitter/tree-sitter-javascript/blob/master/grammar.js#L972C5-L980C8
    // http://stackoverflow.com/questions/13014947/regex-to-match-a-c-style-multiline-comment/36328890#36328890
    comment: _ => token(choice(
      seq('//', /[^\r\n\u2028\u2029]*/),
      seq(
        '/*',
        /[^*]*\*+([^/*][^*]*\*+)*/,
        '/',
      ),
    )),

    const: $ => 'const',
    let: $ => 'let',

    number: _ => {
      const hexLiteral = seq(
        choice('0x', '0X'),
        /[\da-fA-F](_?[\da-fA-F])*/,
      );

      const decimalDigits = /\d(_?\d)*/;
      const signedInteger = seq(optional(choice('-', '+')), decimalDigits);
      const exponentPart = seq(choice('e', 'E'), signedInteger);

      const binaryLiteral = seq(choice('0b', '0B'), /[0-1](_?[0-1])*/);

      const octalLiteral = seq(choice('0o', '0O'), /[0-7](_?[0-7])*/);

      const bigintLiteral = seq(choice(hexLiteral, binaryLiteral, octalLiteral, decimalDigits), 'n');

      const decimalIntegerLiteral = choice(
        '0',
        seq(optional('0'), /[1-9]/, optional(seq(optional('_'), decimalDigits))),
      );

      const decimalLiteral = choice(
        seq(decimalIntegerLiteral, '.', optional(decimalDigits), optional(exponentPart)),
        seq('.', decimalDigits, optional(exponentPart)),
        seq(decimalIntegerLiteral, exponentPart),
        decimalDigits,
      );

      return token(choice(
        hexLiteral,
        decimalLiteral,
        binaryLiteral,
        octalLiteral,
        bigintLiteral,
      ));
    },

    _number: $ => prec.left(1, seq(
      field('operator', choice('-', '+')),
      field('argument', $.number),
    )),

    array_literal: $ => seq(
      '[',
      commaSep1($.expression),
      ']',
    ),

    object_literal: $ => seq(
      '{',
      commaSep1(choice(
        $.key_value_pair,
        alias($.identifier, $.shorthand_property_identifier),
      )),
      optional(','),
      '}',
    ),

    string: $ => choice(
      seq(
        '"',
        repeat(choice(
          alias($.unescaped_double_string_fragment, $.string_fragment),
          $.escape_sequence,
        )),
        '"',
      ),
      seq(
        '\'',
        repeat(choice(
          alias($.unescaped_single_string_fragment, $.string_fragment),
          $.escape_sequence,
        )),
        '\'',
      ),
    ),

    key_value_pair: $ => seq(
      $.identifier,
      ':',
      $.expression,
    ),

    // Workaround to https://github.com/tree-sitter/tree-sitter/issues/1156
    // We give names to the token() constructs containing a regexp
    // so as to obtain a node in the CST.
    //
    unescaped_double_string_fragment: _ => token.immediate(prec(1, /[^"\\\r\n]+/)),

    // same here
    unescaped_single_string_fragment: _ => token.immediate(prec(1, /[^'\\\r\n]+/)),

    escape_sequence: _ => token.immediate(seq(
      '\\',
      choice(
        /[^xu0-7]/,
        /[0-7]{1,3}/,
        /x[0-9a-fA-F]{2}/,
        /u[0-9a-fA-F]{4}/,
        /u\{[0-9a-fA-F]+\}/,
        /[\r?][\n\u2028\u2029]/,
      ),
    )),

    template_string: $ => seq(
      '`',
      repeat(choice(
        alias($._template_chars, $.string_fragment),
        $.escape_sequence,
        $.template_substitution,
      )),
      '`',
    ),

    template_substitution: $ => seq(
      '${',
      $.expression,
      '}',
    ),

    regex: $ => seq(
      '/',
      field('pattern', $.regex_pattern),
      token.immediate(prec(1, '/')),
      optional(field('flags', $.regex_flags)),
    ),

    regex_pattern: _ => token.immediate(prec(-1,
      repeat1(choice(
        seq(
          '[',
          repeat(choice(
            seq('\\', /./), // escaped character
            /[^\]\n\\]/, // any character besides ']' or '\n'
          )),
          ']',
        ), // square-bracket-delimited character class
        seq('\\', /./), // escaped character
        /[^/\\\[\n]/, // any character besides '[', '\', '/', '\n'
      )),
    )),

    regex_flags: _ => token.immediate(/[a-z]+/),

    true: $ => 'true',
    false: $ => 'false',
    undefined: $ => 'undefined',
  }
});

/**
 * Creates a rule to match one or more of the rules separated by a comma
 *
 * @param {Rule} rule
 *
 * @returns {SeqRule}
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}

/**
 * Creates a rule to optionally match one or more of the rules separated by a comma
 *
 * @param {Rule} rule
 *
 * @returns {ChoiceRule}
 */
function commaSep(rule) {
  return optional(commaSep1(rule));
}