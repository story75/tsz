package tree_sitter_tsz_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_tsz "github.com/story75/tsz/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_tsz.Language())
	if language == nil {
		t.Errorf("Error loading TSZ grammar")
	}
}
