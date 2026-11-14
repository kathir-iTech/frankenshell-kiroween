def generate(rng, index):
    edge_cases = [None, 0, 1]
    quantity = edge_cases[index] if index < len(edge_cases) else rng.randint(0, 50)
    return {"quantity": quantity, "unit_cents": rng.randint(1, 1000)}


def check(order, actual):
    quantity = order["quantity"]
    expected = (1 if quantity is None else quantity) * order["unit_cents"]
    return {} if actual == expected else {
        "incorrect_total": {"expected": expected, "actual": actual},
    }
