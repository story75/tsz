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

  // #region Tree-Sitter DSL

  externals: ($) => [
    $._template_chars,
    $.html_comment,
    '||',
    // We use escape sequence and regex pattern to tell the scanner if we're currently inside a string or template string, in which case
    // it should NOT parse html comments.
    $.escape_sequence,
    $.regex_pattern,
  ],

  extras: ($) => [
    $.comment,
    $.html_comment,
    /[\s\p{Zs}\uFEFF\u2028\u2029\u2060\u200B]/, // required for comments to be parsed correctly
  ],

  precedences: ($) => [
    [$.if_ternary_expression, $.binary_expression, $.member_expression],
    [
      'assign',
      'member',
      'call',
      'unary_void',
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
      $.if_ternary_expression,
      $.arrow_function_expression,
      'object',
    ],
    ['assign', $.primary_expression],
    ['member', 'call', $.expression],
    [$.match_range, $.number],
  ],

  conflicts: ($) => [
    [$._block_level_statement, $.primary_expression],
    [$._block_level_statement, $.expression],
    [$._lhs_expression, $.primary_expression],
    [$.assignment_expression, $.pattern],
    [$._property_identifier, $._key_value_pair],
    [$._property_identifier, $.object_literal],
    [$._object_member_identifier, $._match_condition],
  ],

  word: ($) => $.identifier,

  supertypes: ($) => [$.statement, $.expression, $.type],

  // #endregion

  rules: {
    // IMPORTANT: THIS MUST BE THE FIRST RULE OR TREE SITTER WILL BREAK
    //    Failed to find a variable with the same rule as the word token
    //    note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
    // The root node of the AST.
    program: ($) => repeat($._top_level_statement),

    // #region Identifiers
    // Identifiers are used to name symbols like variables, functions, types, etc.
    // tsz identifiers also require the first character to be a letter or underscore.
    // unlike in JS, tsz only allows letters, digits and underscores in identifiers including $
    identifier: ($) => /[a-zA-Z_][a-zA-Z0-9_$]*/,

    // Private property identifiers are used to access private properties of a class.
    private_property_identifier: ($) => seq('#', $.identifier),

    // Comptime identifiers are used to indicate symbols that are evaluated at compile time.
    // tsz e.g. offers inbuilt functions like @typeOf(value) which returns the type of a value at compile time.
    // TODO: this clashes with the @ symbol used for decorators in JS/TS.
    comptime_identifier: ($) => seq('@', $.identifier),

    // Boolean literals just like in JS.
    // booleans, just like in TS, can be used as values and types.
    true: ($) => 'true',
    false: ($) => 'false',
    // undefined literal just like in JS.
    // undefined, just like in TS, can be used as a value and type.
    // Although in tsz it is prefered to use type? instead.
    undefined: ($) => 'undefined',

    // Property identifier is used to name a property of an object.
    _property_identifier: ($) => choice($.identifier, $.private_property_identifier),

    // Object member identifier is used to name a member of an object e.g. obj.a.b.c
    _object_member_identifier: ($) => seq($.identifier, repeat(seq('.', $.identifier))),

    // #endregion

    // #region Types

    // Type annotation is used to annotate a variable with a type.
    type_annotation: ($) => seq(':', field('type', $.type)),

    // Types in tsz can be suffixed with a question mark to indicate that the type is optional.
    // This is equal to type | undefined in TS.
    or_undefined_type: ($) => seq($.type, '?'),

    // Primitive types in tsz.
    // This is a subset of the types in TS.
    // Notably tsz does not support 'object', 'function' and'any' as primitive types.
    // tsz tries to enforce more strict rules for type inference,
    // The substitutes for the above mentioned types would be roughly:
    // - object: dict type like `{ [key: string]: value }`
    // - function: fn type like `(args: any) => return_type`
    // - any: unknown
    primitive_type: ($) =>
      choice(
        'boolean',
        'number',
        'string',
        'void',
        'unknown',
        $.undefined,
        $.true,
        $.false,
        'never',
        'symbol',
      ),

    // A list of elements with a uniform type, just like in TS.
    array_type: ($) => seq($.type, '[', ']'),

    // A list of elements with a fixed number of elements with different types, just like in TS.
    tuple_type: ($) => seq('[', commaSep($.type), optional(','), ']'),

    // A union of two types, just like in TS.
    union_type: ($) => prec.left(seq(optional($.type), '|', $.type)),

    // All possible combinations of types in tsz.
    // In parts this mirrors the type system of TS, but as a smaller subset.
    type: ($) =>
      choice(
        alias($.identifier, $.type_identifier),
        $.primitive_type,
        $.array_type,
        $.tuple_type,
        $.union_type,
        $.or_undefined_type,
      ),

    // #endregion

    // #region Statements

    // Statements are used to execute code. Grouped for supertype.
    statement: ($) => choice($._top_level_statement, $._block_level_statement),

    // Statements that can be at the top level of the program.
    _top_level_statement: ($) => choice($._block_level_statement),

    // Blocks are used to group statements together, which create a new scope.
    // Variables declared in a block are not visible outside of the block and must not be shadowed by variables with the same name in the outer scope.
    block_statement: ($) => seq('{', repeat($._block_level_statement), '}'),

    // Statements that can be in a dedicated block { ... }
    _block_level_statement: ($) =>
      choice(
        $.function_declaration,
        $.variable_declaration,
        $.call_statement,
        $.match_expression,
        $.enum_declaration,
        $.if_statement,
        $.block_statement,
        $.assignment_expression,
        $.return_statement,
        $.break_statement,
        // $.continue_statement, // enable once for loop is implemented
      ),

    // Break statements are used to break out of blocks.
    break_statement: ($) => seq('break', ';'),

    // // Continue statements are used to skip the rest of the current iteration of a loop.
    // continue_statement: $ => seq('continue', ';'),

    // If statements can either be a regualr statement inside a block,
    // or a ternary expression inside an expression context.
    if_statement: ($) =>
      seq(
        'if',
        field('condition', $.parenthesized_expression),
        field('consequence', $.block_statement),
        optional(seq('else', field('alternative', choice($.block_statement, $.if_statement)))),
      ),

    // Ternary expressions are always inside an expression context,
    // and can be nested. They not not require brackets around the consequence and alternative, unlike the statement form.
    // tsz does not support var ? consequence : alternative and instead uses the more verbose if var consequence else alternative syntax.
    if_ternary_expression: ($) =>
      seq(
        'if',
        field('condition', $.parenthesized_expression),
        field('consequence', $.expression),
        'else',
        field('alternative', $.expression),
      ),

    // Parenthesized expressions are used to group expressions and override the precedence of the expression.
    // Some constructs like match and if statement require a parenthesized expression to be used as the condition.
    parenthesized_expression: ($) => seq('(', $.expression, ')'),

    // Match expressions are used to match a value against a list of cases.
    // This is like a switch statement, but more powerful more akin to match in Rust or Switch in Zig.
    match_expression: ($) =>
      seq(
        'match',
        field('value', $.parenthesized_expression),
        field('body', seq('{', repeat($.match_case), optional($.match_else), '}')),
      ),

    // Match cases are used to match a value against a list of cases.
    // The condition is a list of expressions separated by commas.
    // e.g. case 1, 2, 3: ... or even more complex patterns like case 1..3, 10..20: ...
    match_case: ($) =>
      seq(
        'case',
        field('condition', commaSep1($._match_condition)),
        ':',
        field('consequence', choice($.block_statement, $.expression)),
        ';',
      ),

    // Match range is used to match a value against a range of numbers.
    // e.g. case 1..3: ... or case 10..20: ...
    // Ranges are inclusive of the start and end values.
    // tsz only uses two dots like Rust, not three like Zig.
    match_range: ($) =>
      seq(
        field('start', alias($.match_range_number, $.number)),
        '..',
        field('end', alias($.match_range_number, $.number)),
      ),

    // Due to conflicts with the number rule, we need to use a separate rule for match range numbers.
    match_range_number: ($) => {
      const rangeNumber = seq(optional(choice('-', '+')), /\d+/);
      return token(rangeNumber);
    },

    _match_condition: ($) =>
      choice(
        $.match_range,
        alias($.match_range_number, $.number),
        $.string,
        $.true,
        $.false,
        $.undefined,
        $.identifier,
        $._object_member_identifier,
      ),

    // Match else is used to catch everything that does not match any of the cases.
    // This is akin to Zig
    match_else: ($) =>
      seq('else', ':', field('consequence', choice($.block_statement, $.expression)), ';'),

    // Function declarations are used to create a new function in the form of function name(arguments) { ... }
    // Alternatives are arrow functions and function expressions.
    // Functions declarations in tsz require an explicit return type.
    function_declaration: ($) =>
      seq(
        'function',
        $.identifier,
        $.argument_list_declaration,
        field('return_type', $.type_annotation),
        field('body', $.block_statement),
      ),

    // Argument list is used to declare a list of arguments for a function.
    argument_list_declaration: ($) => seq('(', commaSep(optional($.argument_declaration)), ')'),

    // Argument declaration is used to describe a single argument in an argument list.
    // It consists of an optional spread operator, a name, and a type annotation.
    // tsz requires a type annotation for each argument.
    argument_declaration: ($) =>
      seq(
        optional(field('spread', '...')),
        field('name', $.identifier),
        field('type', $.type_annotation),
      ),

    // Argument list is used to pass arguments to a function.
    // A argument list mirrors the argument list declaration without the type constraints.
    argument_list: ($) =>
      seq('(', commaSep(optional(choice($.expression, $.spread_argument))), ')'),

    // A spread argument is used to pass an array of arguments to a function.
    // The array is the destructuring result of the expression.
    spread_argument: ($) => seq('...', $.expression),

    // Anonymous function expressions are used to create a new function in the form of function(arguments) { ... }
    // which can be used inline as an argument to a function call.
    // The only difference to a function declaration is that the identifier is ommited.
    anonymous_function_expression: ($) =>
      seq(
        'function',
        $.argument_list_declaration,
        field('return_type', $.type_annotation),
        field('body', $.block_statement),
      ),

    // Arrow function expressions are used to create a new function in the form of (arguments) => { ... }
    // which can be used inline as an argument to a function call.
    // Unlike the anonymous function expression, the body is not required to be a block statement.
    arrow_function_expression: ($) =>
      seq(
        $.argument_list_declaration,
        field('return_type', $.type_annotation),
        '=>',
        field('body', choice($.block_statement, $.expression)),
      ),

    // Variable declarations are used to declare a new variable.
    // They can be used to declare a constant or a let variable.
    // Constants are immutable and must be initialized with a value.
    // Let variables are mutable and can be reassigned. They can also be declared without an initializer.
    // Type annotations are optional for variables and can be inferred by the compiler through the initializer.
    // Variables without an initializer will be of type unknown.
    variable_declaration: ($) =>
      seq(
        field('kind', choice(alias('const', $.const), alias('let', $.let))),
        field('name', $.identifier),
        optional($.type_annotation),
        optional(seq('=', field('value', $.expression))),
        ';',
      ),

    // Enum declarations are used to declare a union of named values.
    enum_declaration: ($) =>
      seq('enum', $.identifier, '{', commaSep1($.identifier), optional(','), '}'),

    // A call statement is a explicit call to a function in a block which must be terminated with a semicolon.
    call_statement: ($) => seq($.call_expression, ';'),

    // A return statement is used to return a value from a function.
    return_statement: ($) => seq('return', $.expression, ';'),

    // #endregion

    // #region Expressions

    // #region Primitive values

    // A primitive value like in JS.
    // number => 1, 1.23, 1.23e-10
    // string => "hello", 'hello'
    // template_string => `hello`
    // object_literal => {a: 1, b: 2}
    // regex => /hello/i
    // array_literal => [1, 2, 3]
    primitive_value: ($) =>
      choice($.number, $.string, $.template_string, $.object_literal, $.regex, $.array_literal),

    // A wrapped primitive value is a primitive value that is wrapped in parentheses.
    // e.g. (1), ("hello"), ([1, 2, 3]), ({a: 1, b: 2}), (/hello/i)
    // The values are wrapped to remove ambiguity in the grammar.
    // In fact most of those also have to be wrapped in JS
    _wrapped_primitive_value: ($) => seq('(', choice($.primitive_value), ')'),

    // numbers in the same notation as in JS
    number: (_) => {
      const hexLiteral = seq(choice('0x', '0X'), /[\da-fA-F](_?[\da-fA-F])*/);

      const decimalDigits = /\d(_?\d)*/;
      const signedInteger = seq(optional(choice('-', '+')), decimalDigits);
      const exponentPart = seq(choice('e', 'E'), signedInteger);

      const binaryLiteral = seq(choice('0b', '0B'), /[0-1](_?[0-1])*/);

      const octalLiteral = seq(choice('0o', '0O'), /[0-7](_?[0-7])*/);

      const bigintLiteral = seq(
        choice(hexLiteral, binaryLiteral, octalLiteral, decimalDigits),
        'n',
      );

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

      return token(choice(hexLiteral, decimalLiteral, binaryLiteral, octalLiteral, bigintLiteral));
    },

    // Strings can either be double quoted or single quoted just like in JS.
    string: ($) =>
      choice(
        seq(
          '"',
          repeat(
            choice(alias($.unescaped_double_string_fragment, $.string_fragment), $.escape_sequence),
          ),
          '"',
        ),
        seq(
          "'",
          repeat(
            choice(alias($.unescaped_single_string_fragment, $.string_fragment), $.escape_sequence),
          ),
          "'",
        ),
      ),

    // #region Template strings
    // Workaround to https://github.com/tree-sitter/tree-sitter/issues/1156
    // We give names to the token() constructs containing a regexp
    // so as to obtain a node in the CST.
    unescaped_double_string_fragment: (_) => token.immediate(prec(1, /[^"\\\r\n]+/)),

    // same here
    unescaped_single_string_fragment: (_) => token.immediate(prec(1, /[^'\\\r\n]+/)),

    escape_sequence: (_) =>
      token.immediate(
        seq(
          '\\',
          choice(
            /[^xu0-7]/,
            /[0-7]{1,3}/,
            /x[0-9a-fA-F]{2}/,
            /u[0-9a-fA-F]{4}/,
            /u\{[0-9a-fA-F]+\}/,
            /[\r?][\n\u2028\u2029]/,
          ),
        ),
      ),

    template_string: ($) =>
      seq(
        '`',
        repeat(
          choice(
            alias($._template_chars, $.string_fragment),
            $.escape_sequence,
            $.template_substitution,
          ),
        ),
        '`',
      ),

    template_substitution: ($) => seq('${', $.expression, '}'),
    // #endregion

    // #region Regex
    regex: ($) =>
      seq(
        '/',
        field('pattern', $.regex_pattern),
        token.immediate(prec(1, '/')),
        optional(field('flags', $.regex_flags)),
      ),

    regex_pattern: (_) =>
      token.immediate(
        prec(
          -1,
          repeat1(
            choice(
              seq(
                '[',
                repeat(
                  choice(
                    seq('\\', /./), // escaped character
                    /[^\]\n\\]/, // any character besides ']' or '\n'
                  ),
                ),
                ']',
              ), // square-bracket-delimited character class
              seq('\\', /./), // escaped character
              /[^/\\\[\n]/, // any character besides '[', '\', '/', '\n'
            ),
          ),
        ),
      ),

    regex_flags: (_) => token.immediate(/[a-z]+/),
    // #endregion

    array_literal: ($) => seq('[', commaSep1($.expression), ']'),

    // #region Object literals
    object_literal: ($) =>
      seq(
        '{',
        commaSep1(
          field(
            'member',
            choice($._key_value_pair, alias($.identifier, $.shorthand_property_identifier)),
          ),
        ),
        optional(','),
        '}',
      ),

    _key_value_pair: ($) => seq(field('key', $.identifier), ':', field('value', $.expression)),
    // #endregion

    // #region Assignment expressions

    assignment_expression: ($) =>
      prec.right(
        'assign',
        seq(
          field('left', $._lhs_expression), // JS also allowed expressions wrapped in parentheses, but tsz should not
          '=',
          field('right', $.expression),
          ';',
        ),
      ),

    _augmented_assignment_lhs: ($) =>
      choice($.member_expression, $.identifier, $.parenthesized_expression),

    augmented_assignment_expression: ($) =>
      prec.right(
        'assign',
        seq(
          field('left', $._augmented_assignment_lhs),
          field(
            'operator',
            choice(
              '+=',
              '-=',
              '*=',
              '/=',
              '%=',
              '^=',
              '&=',
              '|=',
              '>>=',
              '>>>=',
              '<<=',
              '**=',
              '&&=',
              '||=',
              '??=',
            ),
          ),
          field('right', $.expression),
        ),
      ),

    optional_chain: ($) => '?.',

    member_expression: ($) =>
      prec(
        'member',
        seq(
          field('object', choice($.primary_expression)), // TODO: enforce that not every expression is allowed here; $.primary_expression unset
          choice('.', field('optional_chain', $.optional_chain)),
          field(
            'property',
            choice($.private_property_identifier, alias($.identifier, $.property_identifier)),
          ),
        ),
      ),

    // #region Pattern destructuring

    _lhs_expression: ($) => choice($.member_expression, $.identifier, $._destructuring_pattern),

    // Taken directly from tree-sitter-javascript
    // This negative dynamic precedence ensures that during error recovery,
    // unfinished constructs are generally treated as literal expressions,
    // not patterns.
    pattern: ($) => prec.dynamic(-1, choice($._lhs_expression, $.rest_pattern)),

    rest_pattern: ($) => prec.right(seq('...', $._lhs_expression)),

    // Destructuring pattern is used to destructure an object or array.
    // e.g. {a, b} = {a: 1, b: 2} or [a, b] = [1, 2]
    _destructuring_pattern: ($) => choice($.object_pattern, $.array_pattern),

    assignment_pattern: ($) => seq(field('left', $.pattern), '=', field('right', $.expression)),

    // Pair pattern is used to define destructure elements in an object pattern.
    // e.g. {a: foo, b: bar} = {a: 1, b: 2} where key = a and value = foo or b and bar
    pair_pattern: ($) =>
      seq(
        field('key', $._property_identifier),
        ':',
        field('value', choice($.pattern, $.assignment_pattern)),
      ),

    object_pattern: ($) =>
      prec(
        'object',
        seq(
          '{',
          commaSep(
            optional(
              choice(
                $.pair_pattern,
                $.rest_pattern,
                alias($._property_identifier, $.shorthand_property_identifier_pattern),
              ),
            ),
          ),
          '}',
        ),
      ),

    array_pattern: ($) =>
      seq('[', commaSep(optional(choice($.pattern, $.assignment_pattern))), ']'),

    // #endregion

    // #endregion

    // #region Binary expressions
    // Binary expressions are used to combine two expressions with an operator.
    // The expressions are the same as in JS with the caveat that == and != are not allowed in favor of === and !==.
    // The reason is that people switching back and forth between TS and tsz will get mixed up by the difference,
    // if tsz would use == and != as the default, even though it would better align with other languages,
    // but it's better to enforce triple equals to ease the transition.
    binary_expression: ($) =>
      choice(
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
          (associativity === 'right' ? prec.right : prec.left)(
            precedence,
            seq(
              field(
                'left',
                operator === 'in'
                  ? choice($.expression, $.private_property_identifier)
                  : $.expression,
              ),
              field('operator', operator),
              field('right', $.expression),
            ),
          ),
        ),
      ),

    // Unary expressions are used to apply a unary operator to an expression.
    // In contrast to JS, tsz does not support the delete operator.
    // !: not
    // ~: bitwise not
    // -: negate
    // +: unary plus
    // typeof: typeof
    // void: void
    unary_expression: ($) =>
      prec.left(
        'unary_void',
        seq(
          field('operator', choice('!', '~', '-', '+', 'typeof', 'void')),
          field('argument', $.expression),
        ),
      ),

    // Update expressions are used to increment or decrement a value.
    // They can be used as expressions or statements.
    update_expression: ($) =>
      prec.left(
        choice(
          seq(field('argument', $.expression), field('operator', choice('++', '--'))),
          seq(field('operator', choice('++', '--')), field('argument', $.expression)),
        ),
      ),
    // #endregion

    call_expression: ($) =>
      choice(
        prec('call', seq(field('function', $.expression), field('arguments', $.argument_list))),
        // prec('template_call', seq(
        //   field('function', choice($.primary_expression, $.new_expression)),
        //   field('arguments', $.template_string),
        // )),
        prec(
          'member',
          seq(
            field('function', $.primary_expression),
            field('optional_chain', $.optional_chain),
            field('arguments', $.argument_list),
          ),
        ),
      ),

    primary_expression: ($) =>
      choice(
        $.member_expression,
        $.parenthesized_expression,
        $.match_expression,
        $.anonymous_function_expression,
        $.arrow_function_expression,
        $.template_string,
        $.true,
        $.false,
        $.undefined,
        $.number,
        $.string,
        $.object_literal,
        $.regex,
        $.array_literal,
        $.identifier,
        $.comptime_identifier,
      ),

    expression: ($) =>
      choice(
        $.primary_expression,
        $.assignment_expression,
        $.augmented_assignment_expression,
        $.unary_expression,
        $.binary_expression,
        $.if_ternary_expression,
        $.call_expression,
      ),

    // #endregion

    // #region Comments

    // tsz supports C-style comments.
    // https://github.com/tree-sitter/tree-sitter-javascript/blob/master/grammar.js#L972C5-L980C8
    // http://stackoverflow.com/questions/13014947/regex-to-match-a-c-style-multiline-comment/36328890#36328890
    comment: (_) =>
      token(choice(seq('//', /[^\r\n\u2028\u2029]*/), seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/'))),

    // #endregion
  },
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
