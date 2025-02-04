import XCTest
import SwiftTreeSitter
import TreeSitterTsz

final class TreeSitterTszTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_tsz())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading TSZ grammar")
    }
}
