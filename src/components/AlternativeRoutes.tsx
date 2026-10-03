"use client";

type AlternativeRoutesProps = {
  distanceKm: number;
  disrupted: boolean;
};

type RouteOption = {
  name: string;
  description: string;
  eta: number;
  cost: number;
  risk: number;
};

export default function AlternativeRoutes({
  distanceKm,
  disrupted,
}: AlternativeRoutesProps) {
  const safeDistance =
    Number.isFinite(distanceKm) && distanceKm > 0
      ? distanceKm
      : 10000;

  /*
    These use the same general assumptions as the
    current SupplyAI estimation engine.

    Later we can move all calculations into one shared
    file, but we're keeping this isolated for now so we
    don't break the working dashboard.
  */

  const oceanEta = Math.ceil(
    (safeDistance * 1.15) / 650 + 4
  );

  const airEta = Math.ceil(
    (safeDistance * 1.05) / 4500 + 1
  );

  const standardOceanCost =
    1800 + safeDistance * 1.15 * 0.65;

  const airCost =
    2800 + safeDistance * 1.05 * 1.35;

  const contingencyCost =
    standardOceanCost * 1.18;

  const options: RouteOption[] = disrupted
    ? [
        {
          name: "Ocean — Current Route",
          description: "Existing shipment plan",
          eta: oceanEta + 5,
          cost: standardOceanCost * 1.25,
          risk: 72,
        },
        {
          name: "Air — Expedite",
          description: "Fastest disruption response",
          eta: airEta,
          cost: airCost,
          risk: 18,
        },
        {
          name: "Ocean — Contingency",
          description: "Lower-risk alternate routing",
          eta: oceanEta + 3,
          cost: contingencyCost,
          risk: 24,
        },
      ]
    : [
        {
          name: "Ocean — Standard",
          description: "Lowest-cost standard routing",
          eta: oceanEta,
          cost: standardOceanCost,
          risk: 18,
        },
        {
          name: "Air — Expedite",
          description: "Fastest delivery option",
          eta: airEta,
          cost: airCost,
          risk: 12,
        },
        {
          name: "Ocean — Contingency",
          description: "Reduced route exposure",
          eta: oceanEta + 3,
          cost: contingencyCost,
          risk: 9,
        },
      ];

  /*
    Recommendation score.

    Risk is weighted most heavily.
    Cost and ETA also influence the decision.
  */

  const scoredOptions = options.map((option) => {
    const score =
      option.risk * 0.55 +
      option.eta * 0.25 +
      (option.cost / 1000) * 0.2;

    return {
      ...option,
      score,
    };
  });

  const recommended = scoredOptions.reduce(
    (best, current) =>
      current.score < best.score ? current : best
  );

  function riskLabel(risk: number) {
    if (risk >= 60) return "CRITICAL";
    if (risk >= 30) return "ELEVATED";
    return "LOW";
  }

  function riskColor(risk: number) {
    if (risk >= 60) {
      return "text-red-600";
    }

    if (risk >= 30) {
      return "text-amber-600";
    }

    return "text-emerald-600";
  }

  return (
    <div className="border-t border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Decision Intelligence
            </p>

            <h2 className="mt-1 text-sm font-bold text-slate-900">
              Alternative Options
            </h2>
          </div>

          <div className="rounded-sm bg-slate-900 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.15em] text-white">
            AI Ranked
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-200">
        {scoredOptions.map((option) => {
          const isRecommended =
            option.name === recommended.name;

          return (
            <div
              key={option.name}
              className={
                isRecommended
                  ? "border-l-4 border-l-emerald-500 bg-emerald-50/60 px-5 py-4"
                  : "border-l-4 border-l-transparent px-5 py-4"
              }
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  {isRecommended && (
                    <p className="mb-1 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-600">
                      Recommended
                    </p>
                  )}

                  <p className="text-xs font-bold text-slate-900">
                    {option.name}
                  </p>

                  <p className="mt-1 text-[10px] text-slate-500">
                    {option.description}
                  </p>
                </div>

                <div className="text-right">
                  <p
                    className={`text-[10px] font-black ${riskColor(
                      option.risk
                    )}`}
                  >
                    {option.risk}% RISK
                  </p>

                  <p
                    className={`mt-1 text-[9px] font-bold ${riskColor(
                      option.risk
                    )}`}
                  >
                    {riskLabel(option.risk)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="border border-slate-200 bg-white px-2 py-2">
                  <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
                    ETA
                  </p>

                  <p className="mt-1 text-xs font-bold text-slate-800">
                    {option.eta} days
                  </p>
                </div>

                <div className="border border-slate-200 bg-white px-2 py-2">
                  <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
                    Cost
                  </p>

                  <p className="mt-1 text-xs font-bold text-slate-800">
                    $
                    {Math.round(
                      option.cost
                    ).toLocaleString()}
                  </p>
                </div>

                <div className="border border-slate-200 bg-white px-2 py-2">
                  <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
                    Exposure
                  </p>

                  <p
                    className={`mt-1 text-xs font-bold ${riskColor(
                      option.risk
                    )}`}
                  >
                    {option.risk}%
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className={
          disrupted
            ? "border-t border-red-200 bg-red-50 px-5 py-4"
            : "border-t border-emerald-200 bg-emerald-50 px-5 py-4"
        }
      >
        <p
          className={
            disrupted
              ? "text-[9px] font-black uppercase tracking-[0.18em] text-red-600"
              : "text-[9px] font-black uppercase tracking-[0.18em] text-emerald-600"
          }
        >
          SupplyAI Recommendation
        </p>

        <p className="mt-2 text-xs font-bold text-slate-900">
          {recommended.name}
        </p>

        <p className="mt-1 text-[10px] leading-4 text-slate-600">
          {disrupted
            ? "Conditions have changed. SupplyAI re-ranked available options using projected risk, delay, and cost impact."
            : "Current conditions favor this option based on modeled risk, estimated transit time, and cost."}
        </p>
      </div>
    </div>
  );
}