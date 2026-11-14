def total(order):
    quantity = order["quantity"]
    return (1 if quantity is None else quantity) * order["unit_cents"]
