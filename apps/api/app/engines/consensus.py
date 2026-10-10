"""Risk budget and consensus. Code, not an LLM: judges can check the arithmetic."""

from __future__ import annotations

from app.models.desk import Consensus, DeskTake, Profile

VETO_ANOMALY = 70.0


def risk_budget(p: Profile) -> float:
    """5% of monthly discretionary income, scaled by tolerance (0.5x–1.5x), floored at $0."""
    if p.discretionary <= 0:
        return 0.0
    tol = min(1.5, max(0.5, p.risk_tolerance))
    return round(p.discretionary * 0.05 * tol, 2)


def kelly_lite(prob: float, price: float) -> float:
    """Fraction of budget to stake on YES at `price` given belief `prob`, half-Kelly, clipped to [0, 0.5]."""
    if price <= 0 or price >= 1:
        return 0.0
    b = (1 - price) / price  # net odds
    f = (prob * b - (1 - prob)) / b
    return max(0.0, min(0.5, f * 0.5))


def consensus(takes: list[DeskTake], *, price: float, budget: float, anomaly_score: float) -> Consensus:
    conf = {t.persona: (t.revised_confidence if t.revised_confidence is not None else t.confidence) for t in takes}
    w_yes = round(sum(conf[t.persona] for t in takes if t.stance == "yes"), 3)
    w_no = round(sum(conf[t.persona] for t in takes if t.stance == "no"), 3)
    w_pass = round(sum(conf[t.persona] for t in takes if t.stance == "pass"), 3)
    riskmgr = next((t for t in takes if t.persona == "riskmgr"), None)

    vetoed, reason = False, None
    if budget <= 0:
        vetoed, reason = True, "Risk budget is $0: discretionary income does not cover a speculative loss."
    elif anomaly_score >= VETO_ANOMALY:
        vetoed, reason = True, f"Anomaly score {anomaly_score:.0f} is above {VETO_ANOMALY:.0f}: the Risk Manager will not size into a contract that looks manipulated."
    elif riskmgr and riskmgr.stance == "pass" and max(riskmgr.confidence, conf["riskmgr"]) >= 0.75:
        vetoed, reason = True, f"The Risk Manager passed with high confidence: {riskmgr.argument.split('. ')[0]}."

    if vetoed:
        return Consensus(decision="pass", size_usd=0.0, risk_budget=budget, kelly_fraction=0.0, weighted_yes=w_yes, weighted_no=w_no, vetoed=True, veto_reason=reason, summary=f"Pass. {reason}")

    if max(w_yes, w_no) <= w_pass or abs(w_yes - w_no) < 0.15:
        return Consensus(decision="pass", size_usd=0.0, risk_budget=budget, kelly_fraction=0.0, weighted_yes=w_yes, weighted_no=w_no, vetoed=False, summary="Pass. The desk is split; no edge survives the disagreement.")

    side = "yes" if w_yes > w_no else "no"
    total = w_yes + w_no + w_pass
    agreement = (w_yes if side == "yes" else w_no) / total if total else 0.0
    # Belief = market price nudged toward the desk's side by its agreement; Kelly-lite on that belief.
    p_mkt = price if side == "yes" else 1 - price
    belief = min(0.97, p_mkt + 0.25 * agreement * (1 - p_mkt))
    frac = kelly_lite(belief, p_mkt)
    size = round(min(budget, budget * frac), 2)
    if size < 1:
        return Consensus(decision="pass", size_usd=0.0, risk_budget=budget, kelly_fraction=round(frac, 4), weighted_yes=w_yes, weighted_no=w_no, vetoed=False, summary=f"Pass. Leaning {side.upper()}, but the edge sizes to under a dollar of a ${budget:,.0f} budget.")
    return Consensus(
        decision=side, size_usd=size, risk_budget=budget, kelly_fraction=round(frac, 4), weighted_yes=w_yes, weighted_no=w_no, vetoed=False,
        summary=f"Buy {side.upper()} with ${size:,.0f}, {round(100 * size / budget)}% of a ${budget:,.0f} monthly risk budget (half-Kelly at {belief:.0%} belief vs {p_mkt:.0%} price).",
    )
