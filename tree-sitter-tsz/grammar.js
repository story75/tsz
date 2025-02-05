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
    $._ternary_qmark,
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
      'member',
      'call',
    ],
  ],

  conflicts: $ => [
    [$.call_expression, $.expression],
    [$._call_expression_function_identifier, $.member_expression],
  ],

  word: $ => $.identifier,

  supertypes: $ => [
    $.statement,
    $.expression,
  ],

  rules: {
    source_file: $ => repeat($.statement),
    
    statement: $ => choice(
      $.function_declaration,
      $.variable_declaration,
      $.return_statement,
      $.call_expression,
    ),

    function_declaration: $ => seq(
      'function',
      $.identifier,
      $.parameter_list,
      ':',
      $._type,
      $.block
    ),

    variable_declaration: $ => seq(
      $._declaration_kind,
      $.identifier,
      optional($.type_annotation),
      optional(seq('=',$.expression)),
      ';',
    ),

    parameter_list: $ => seq(
      '(',
       // TODO: parameters
      ')'
    ),

    type_annotation: $ => seq(
      ':',
      $._type,
    ),

    _type: $ => choice(
      $.primitive_type,
      $.array_type,
    ),

    primitive_type: $ => choice(
      'boolean',
      'number',
      'string',
      'void',
      'any',
      'unknown',
      'never',
      'symbol',
      // 'object', TBD
    ),
  
    array_type: $ => seq(
      $._type,
      '[',
      ']',
    ),

    block: $ => seq(
      '{',
      repeat($.statement),
      '}'
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
      ';',
    ),

    _call_expression_function_identifier: $ => choice(
      $.identifier,
      $.member_expression,
      $.number,
      $.string,
      $.regex,
    ),

    arguments: $ => seq(
      '(',
      commaSep(optional(choice($.expression, $.spread_element))),
      ')',
    ),

    spread_element: $ => seq('...', $.expression),

    expression: $ => choice(
      $._call_expression_function_identifier,
      alias($._number, $.unary_expression),
      $.template_string,
      $.true,
      $.false,
      $.undefined,
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