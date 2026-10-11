"""Consensus and stake. Code, not an LLM: judges can check the arithmetic."""

from __future__ import annotations

from dataclasses import dataclass

from app.models.desk import Consensus, DeskTake, RiskAppetite, SideInterest

VETO_ANOMALY = 70.0


@dataclass(frozen=True)
class RiskRules:
    kelly_mult: float  # share of full Kelly
    cap: float  # max stake as a share of the money set aside
    veto_anomaly: float  # anomaly score at which the desk refuses outright
    veto_riskmgr_conf: float  # a Risk Manager "pass" at this confidence or more is a veto


RISK_RULES: dict[str, RiskRules] = {
    "conservative": RiskRules(kelly_mult=0.25, cap=0.05, veto_anomaly=40.0, veto_riskmgr_conf=0.5),
    "moderately_conservative": RiskRules(kelly_mult=0.25, cap=0.10, veto_anomaly=50.0, veto_riskmgr_conf=0.6),
    "moderate": RiskRules(kelly_mult=0.5, cap=0.20, veto_anomaly=VETO_ANOMALY, veto_riskmgr_conf=0.75),
    "moderately_aggressive": RiskRules(kelly_mult=0.5, cap=0.35, veto_anomaly=80.0, veto_riskmgr_conf=0.8),
    "aggressive": RiskRules(kelly_mult=0.5, cap=0.5, veto_anomaly=85.0, veto_riskmgr_conf=0.85),
}
RISK_NAME = {k: k.replace("_", " ") for k in RISK_RULES}


def kelly_lite(prob: float, price: float, *, mult: float = 0.5, cap: float = 0.5) -> float:
    """Fraction of a bankroll to stake on a side priced at `price` given belief `prob`: a share of Kelly, clipped to [0, cap]."""
    if price <= 0 or price >= 1:
        return 0.0
    b = (1 - price) / price  # net odds
    f = (prob * b - (1 - prob)) / b
    return max(0.0, min(cap, f * mult))


def consensus(takes: list[DeskTake], *, price: float, anomaly_score: float, risk: RiskAppetite = "moderate", side_interest: SideInterest = "unsure") -> Consensus:
    rules = RISK_RULES[risk]
    # Where each analyst landed after round two: a revised stance and confidence win over the opening ones.
    conf = {t.persona: (t.revised_confidence if t.revised_confidence is not None else t.confidence) for t in takes}
    final = {t.persona: (t.revised_stance or t.stance) for t in takes}
    w_yes = round(sum(conf[t.persona] for t in takes if final[t.persona] == "yes"), 3)
    w_no = round(sum(conf[t.persona] for t in takes if final[t.persona] == "no"), 3)
    w_pass = round(sum(conf[t.persona] for t in takes if final[t.persona] == "pass"), 3)
    riskmgr = next((t for t in takes if t.persona == "riskmgr"), None)

    def stay_out(summary: str, *, vetoed: bool = False, reason: str | None = None, frac: float = 0.0) -> Consensus:
        return Consensus(decision="pass", belief=0.0, kelly_fraction=round(frac, 4), weighted_yes=w_yes, weighted_no=w_no, vetoed=vetoed, veto_reason=reason, summary=summary)

    if anomaly_score >= rules.veto_anomaly:
        reason = f"Anomaly score {anomaly_score:.0f} is at or above {rules.veto_anomaly:.0f}, the limit for a {RISK_NAME[risk]} investor: the Risk Manager will not back a contract whose price may not be trustworthy."
        return stay_out(f"Pass. {reason}", vetoed=True, reason=reason)
    if riskmgr and final["riskmgr"] == "pass" and conf["riskmgr"] >= rules.veto_riskmgr_conf:
        # The closing reply ends on its conclusion; quote that, not the recap that opens it.
        said = [x.strip() for x in (riskmgr.rebuttal or riskmgr.argument).replace("? ", ". ").split(". ") if x.strip()]
        last_word = said[-1].rstrip(".") if said else "pass"
        reason = f"The Risk Manager is out ({conf['riskmgr']:.0%} confident): {last_word}."
        return stay_out(f"Pass. {reason}", vetoed=True, reason=reason)
    if max(w_yes, w_no) <= w_pass or abs(w_yes - w_no) < 0.15:
        return stay_out("Pass. The desk is split; no edge survives the disagreement.")

    side = "yes" if w_yes > w_no else "no"
    total = w_yes + w_no + w_pass
    agreement = (w_yes if side == "yes" else w_no) / total if total else 0.0
    # Belief = market price nudged toward the desk's side by its agreement; half-Kelly on that belief.
    p_mkt = price if side == "yes" else 1 - price
    belief = min(0.97, p_mkt + 0.25 * agreement * (1 - p_mkt))
    frac = kelly_lite(belief, p_mkt, mult=rules.kelly_mult, cap=rules.cap)
    if frac < 0.01:
        return stay_out(f"Pass. Leaning {side.upper()}, but the edge is too thin to stake anything on.", frac=frac)
    against = side_interest in ("yes", "no") and side_interest != side
    lead = f"You asked about {side_interest.upper()}, but the desk would buy {side.upper()}." if against else f"Buy {side.upper()}."
    return Consensus(
        decision=side, belief=round(belief, 4), kelly_fraction=round(frac, 4), weighted_yes=w_yes, weighted_no=w_no, vetoed=False,
        summary=f"{lead} The desk puts it at {belief:.0%} against a market price of {p_mkt:.0%}; for a {RISK_NAME[risk]} investor, stake about {frac:.0%} of whatever you set aside for this (capped at {rules.cap:.0%}).",
    )
