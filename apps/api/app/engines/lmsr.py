"""Logarithmic market scoring rule market maker. Prices stay in (0, 1) and move smoothly with order flow.

price_yes = e^(q_y/b) / (e^(q_y/b) + e^(q_n/b));  cost C(q) = b * ln(e^(q_y/b) + e^(q_n/b))
Buying `dollars` of YES solves C(q + d) - C(q) = dollars in closed form."""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class LMSR:
    b: float
    q_yes: float = 0.0
    q_no: float = 0.0
    volume: float = 0.0

    @classmethod
    def at_price(cls, p0: float, b: float) -> "LMSR":
        p0 = min(0.995, max(0.005, p0))
        m = cls(b=b)
        m.q_yes = b * math.log(p0 / (1 - p0))  # q_no = 0
        return m

    def price(self) -> float:
        a, c = self.q_yes / self.b, self.q_no / self.b
        mx = max(a, c)
        ea, ec = math.exp(a - mx), math.exp(c - mx)
        return ea / (ea + ec)

    def cost(self) -> float:
        a, c = self.q_yes / self.b, self.q_no / self.b
        mx = max(a, c)
        return self.b * (mx + math.log(math.exp(a - mx) + math.exp(c - mx)))

    def buy(self, side: str, dollars: float) -> float:
        """Spend `dollars` on `side` ('yes'|'no'); returns shares bought. Price moves accordingly."""
        if dollars <= 0:
            return 0.0
        a, c = self.q_yes / self.b, self.q_no / self.b
        mx = max(a, c)
        ea, ec = math.exp(a - mx), math.exp(c - mx)
        total = ea + ec
        k = math.exp(dollars / self.b)
        if side == "yes":
            new_ea = k * total - ec
            shares = self.b * (math.log(new_ea) - math.log(ea))
            self.q_yes += shares
        else:
            new_ec = k * total - ea
            shares = self.b * (math.log(new_ec) - math.log(ec))
            self.q_no += shares
        self.volume += dollars
        return shares
