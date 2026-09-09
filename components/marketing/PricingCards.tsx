import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { PLAN_CARDS, UNIVERSAL_RULES } from "@/lib/shared/plans";

export default function PricingCards() {
  return (
    <>
      <div className="pricing-grid">
        {PLAN_CARDS.filter((plan) => plan.id !== "portfolio").map((plan) => (
          <article
            key={plan.id}
            className={
              "pricing-card " + (plan.id === "growth" ? "featured" : "")
            }
          >
            <div className="flex items-center justify-between">
              <h3>{plan.name}</h3>
              {plan.id === "growth" && (
                <span className="pricing-tag">Room to grow</span>
              )}
            </div>
            {/* Who it is for, before what it costs: a manager should recognise
                themselves in one line and stop reading the other two. */}
            <p className="pricing-description">{plan.audience}</p>
            <p className="pricing-price">
              {plan.priceLabel.split("/")[0]}
              <span>/month, VAT included</span>
            </p>
            <Link
              href="/register"
              className={
                "link-button " + (plan.id === "growth" ? "lime" : "dark")
              }
            >
              Start free trial <ArrowUpRight size={16} />
            </Link>
            <ul>
              {plan.rules.map((rule) => (
                <li key={rule}>
                  <Check size={15} />
                  {rule}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <div className="portfolio-pricing">
        <div>
          <h3>A bigger community? Let’s make room.</h3>
          <p>
            {PLAN_CARDS.find((plan) => plan.id === "portfolio")?.audience}{" "}
            Portfolio is quoted directly, with unit capacity, manager sign-ins
            and support agreed with you.
          </p>
        </div>
        <Link href="/register" className="text-link">
          Explore Portfolio <ArrowUpRight size={17} />
        </Link>
      </div>
      <section className="pricing-rules">
        <h3>How the pricing works</h3>
        <ul>
          {UNIVERSAL_RULES.map((rule) => (
            <li key={rule}>
              <Check size={15} />
              {rule}
            </li>
          ))}
        </ul>
      </section>
      <p className="pricing-footnote">
        Monthly pricing in South African rand, VAT included. Gate-code texts
        beyond the monthly allowance are billed at R0.60 each and we will always
        raise it with you before it appears on an invoice. The total amount is
        shown before payment.
      </p>
    </>
  );
}
