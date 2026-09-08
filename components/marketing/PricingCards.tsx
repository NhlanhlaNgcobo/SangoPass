import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { PLANS } from "@/lib/mock/plans";

export default function PricingCards() {
  return (
    <>
      <div className="pricing-grid">
        {PLANS.filter((plan) => plan.id !== "portfolio").map((plan) => (
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
            <p className="pricing-description">
              {plan.id === "starter"
                ? "A simpler start for a smaller community."
                : plan.id === "growth"
                  ? "More space for a growing portfolio."
                  : "For teams managing at a bigger scale."}
            </p>
            <p className="pricing-price">
              {plan.priceLabel.split("/")[0]}
              <span>/month</span>
            </p>
            <Link
              href="/login"
              className={
                "link-button " + (plan.id === "growth" ? "lime" : "dark")
              }
            >
              Explore {plan.name} <ArrowUpRight size={16} />
            </Link>
            <ul>
              {[
                `Up to ${plan.unitCap} units`,
                `${plan.seatCap} property manager ${plan.seatCap === 1 ? "seat" : "seats"}`,
                "Visitor invitations & QR passes",
                "Rent & maintenance tracking",
                `${plan.support} support`,
              ].map((feature) => (
                <li key={feature}>
                  <Check size={15} />
                  {feature}
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
            Portfolio brings custom unit capacity, dedicated support and a
            tailored plan.
          </p>
        </div>
        <Link href="/login" className="text-link">
          Explore Portfolio <ArrowUpRight size={17} />
        </Link>
      </div>
      <p className="pricing-footnote">
        Indicative monthly pricing in South African rand. This is an interactive
        demo; no payments are collected. Final tax treatment and commercial
        terms will be confirmed before checkout.
      </p>
    </>
  );
}
