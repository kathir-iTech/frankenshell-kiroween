import unittest

from invoice import total


class InvoiceTests(unittest.TestCase):
    def test_positive_quantity(self):
        self.assertEqual(total({"quantity": 2, "unit_cents": 50}), 100)
