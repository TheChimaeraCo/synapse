// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0
"use client";

import { useState, useEffect } from "react";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { Shield, ExternalLink, Check, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TierInfo {
  tier: string;
  limits: { maxUsers: number; maxGateways: number };
}

const TIERS = [
  {
    id: "personal",
    label: "Personal",
    price: "Free",
    maxUsers: 5,
    maxGateways: 1,
    features: ["Core chat & tools", "Knowledge base", "1 gateway", "Up to 5 users", "Community support"],
  },
  {
    id: "team",
    label: "Team",
    price: "$29/mo",
    maxUsers: 15,
    maxGateways: 3,
    features: ["Everything in Personal", "Multi-channel support", "Custom model routing", "Up to 15 users", "3 gateways", "Email support"],
  },
  {
    id: "business",
    label: "Business",
    price: "$79/mo",
    maxUsers: 50,
    maxGateways: 10,
    features: ["Everything in Team", "Advanced analytics", "Custom branding", "API access", "Up to 50 users", "10 gateways", "Priority support"],
    popular: true,
  },
  {
    id: "enterprise",
    label: "Enterprise",
    price: "$199/mo",
    maxUsers: -1,
    maxGateways: -1,
    features: ["Everything in Business", "Unlimited users & gateways", "SSO / SAML", "Audit logging", "SLA guarantee", "Dedicated support"],
  },
];

export function LicenseTab() {
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await gatewayFetch("/api/config/global");
        if (res.ok) {
          const data = await res.json();
          setTierInfo({
            tier: data._tier || "personal",
            limits: data._limits || { maxUsers: 5, maxGateways: 1 },
          });
        }
      } catch {} finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const currentTier = tierInfo?.tier || "personal";

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold text-zinc-200 mb-1 flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-400" />
          License & Plan
        </h2>
        <p className="text-sm text-zinc-400">
          Manage your Synapse license and subscription tier.
        </p>
      </div>

      {/* Current plan */}
      <div className="bg-white/[0.07] backdrop-blur-xl border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-400 mb-1">Current Plan</p>
            <p className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
              {TIERS.find((t) => t.id === currentTier)?.label || "Personal"}
              {currentTier !== "personal" && <Crown className="h-4 w-4 text-amber-400" />}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-zinc-400 mb-1">Limits</p>
            <p className="text-sm text-zinc-300">
              {tierInfo?.limits.maxUsers === Infinity ? "Unlimited" : tierInfo?.limits.maxUsers || 5} users
              {" / "}
              {tierInfo?.limits.maxGateways === Infinity ? "Unlimited" : tierInfo?.limits.maxGateways || 1} gateways
            </p>
          </div>
        </div>
      </div>

      {/* Tier comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {TIERS.map((tier) => {
          const isCurrent = tier.id === currentTier;
          return (
            <div
              key={tier.id}
              className={cn(
                "rounded-xl border p-5 transition-all duration-200 relative",
                isCurrent
                  ? "bg-gradient-to-b from-blue-500/10 to-purple-500/10 border-blue-500/30 shadow-[0_0_30px_rgba(59,130,246,0.1)]"
                  : "bg-white/[0.04] border-white/10 hover:border-white/20",
                tier.popular && !isCurrent && "border-blue-500/20"
              )}
            >
              {tier.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                  Popular
                </span>
              )}
              <h3 className="text-base font-semibold text-zinc-200 mb-1">{tier.label}</h3>
              <p className="text-2xl font-bold text-zinc-100 mb-4">{tier.price}</p>
              <ul className="space-y-2">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-zinc-400">
                    <Check className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {isCurrent ? (
                  <div className="text-center text-sm text-blue-400 font-medium py-2">Current Plan</div>
                ) : (
                  <a
                    href="https://chimaeraco.dev/pricing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-sm font-medium transition-colors",
                      "bg-white/[0.07] hover:bg-white/[0.12] text-zinc-300 hover:text-zinc-100 border border-white/10"
                    )}
                  >
                    {tier.id === "enterprise" ? "Contact Sales" : "Upgrade"}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* License key input */}
      <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">License Key</h3>
        <p className="text-xs text-zinc-500 mb-3">
          Enter your license key to activate a paid plan. Set the <code className="text-zinc-400">SYNAPSE_LICENSE_KEY</code> environment variable and restart.
        </p>
        <div className="flex items-center gap-3">
          <code className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-zinc-400 font-mono truncate">
            {currentTier !== "personal" ? "••••••••••••••••••••" : "No license key configured"}
          </code>
        </div>
      </div>
    </div>
  );
}
