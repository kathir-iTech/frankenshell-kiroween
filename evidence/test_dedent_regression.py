"""Regression for DDT-001: A whitespace-only line must become empty and must not constrain the shared indentation."""
import textwrap
import unittest


class DedentTestCaseRegression(unittest.TestCase):
    def test_ddt_001(self):
        self.assertEqual(textwrap.dedent('  a\n\xa0\n  b'), 'a\n\nb')


if __name__ == "__main__":
    unittest.main()
