"""Regression for QNT-001: A singleton must produce n − 1 cut points, each equal to the sample."""
import statistics
import unittest


class TestQuantilesRegression(unittest.TestCase):
    def test_qnt_001(self):
        self.assertEqual(statistics.quantiles([7], n=2), [7])


if __name__ == "__main__":
    unittest.main()
