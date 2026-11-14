def total(order):
    return (order["quantity"] or 1) * order["unit_cents"]
