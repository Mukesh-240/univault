/**
 * /receive/eligibility — the receiver asks a person for an eligibility answer on the criteria of its OWN purpose, and
 * reads the answers it got: met / not met / unknown per criterion the person allowed, the overall words "ready / not
 * ready under these criteria", the signature check, and the plain statement that it is not proof and gives no document.
 */
import { CheckCircle2, CircleHelp, XCircle } from "lucide-react";
import { currentSession, receiverCode } from "@/lib/auth-server";
import { attestationValid, eligibilityRequests, eligibilityResult, packFor } from "@/lib/eligibility";
import { showTime } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { serverKey } from "@/lib/server";
import { supabase } from "@/lib/supabase";
import { EligibilityForm } from "./EligibilityForm";
import { PageHead } from "@/components/PageHead";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ICON = { met: CheckCircle2, not_met: XCircle, unknown: CircleHelp } as const;
const TONE = { met: "ok", not_met: "bad", unknown: "unk" } as const;

export default async function EligibilityPage() {
  const { lang, t } = await getI18n();
  const code = receiverCode(await currentSession());
  if (!code) return <section className="empty-state"><h1>{t("recv.noaccount.title")}</h1><p>{t("recv.noaccount.body")}</p></section>;
  const rec = await supabase.from("recipients").select("org").eq("recipient_code", code).single();
  const pack = packFor((rec.data as { org: string } | null)?.org ?? "");
  const requests = await eligibilityRequests(supabase, { from: code });
  const answers = await Promise.all(requests.map(async (r) => (r.status === "answered" ? { id: r.id, res: await eligibilityResult(supabase, code, r.id) } : null)));
  const byId = new Map(answers.filter(Boolean).map((a) => [a!.id, a!.res]));
  return (
    <>
      <PageHead title={t("elig.title")} purpose={t("elig.intro")} links={[{ href: "/receive/requests", label: t("nav.recv.side.requests") }]} />
      <p className="callout neutral" role="note">{t("elig.nodocs")}</p>
      <EligibilityForm criteria={(pack?.rules ?? []).map((r) => (lang === "te" && r.label_te ? r.label_te : r.label))} />
      <section className="stack-s" style={{ marginTop: "var(--s4)" }}>
        <h2>{t("nav.recv.side.requests")}</h2>
        {requests.length === 0 ? <p className="card">{t("elig.none")}</p> : (
          <ul className="cards">
            {requests.map((r) => {
              const a = byId.get(r.id);
              return (
                <li key={r.id} className="card">
                  <div className="card-head"><span className="meta">{showTime(r.at)}</span><span className={`chip ${r.status === "answered" ? "ok" : r.status === "declined" ? "warn" : "unk"}`}>{t(`elig.status.${r.status}`)}</span></div>
                  {a && (
                    <>
                      <p className="big">{t(`elig.overall.${a.attestation.overall}`)}</p>
                      <ul className="rules">
                        {a.attestation.results.map((x) => { const I = ICON[x.result]; return <li key={x.rule_id}><span className={`chip ${TONE[x.result]}`}><I size={18} aria-hidden="true" /> {t(`elig.result.${x.result}`)}</span> {x.label}</li>; })}
                      </ul>
                      <p className="note">{t("elig.notproof")}</p>
                      <p className="meta">{attestationValid(a.attestation, a.signature, serverKey("VAULT_PUBLIC_KEY")) ? t("elig.sig.valid") : t("elig.sig.bad")}</p>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
