/**
 * POLICIES — what UNIVAULT stores, what erasing deletes and keeps (and why), retention, who sees what,
 * how killing a share works, and what the watermark can and cannot do. The text lives in
 * src/lib/trust-pages.ts; each section names the code it was checked against. Headings are translated;
 * the details are English (marked lang="en").
 */
import { getI18n } from "@/lib/i18n-server";
import { POLICY } from "@/lib/trust-pages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REPO = "https://github.com/Mukesh-240/univault/blob/main/";

export default async function PolicyPage() {
  const { t } = await getI18n();
  return (
    <>
      <h1>{t("policy.title")}</h1>
      <p className="lead">{t("policy.intro")}</p>
      {POLICY.map((s) => (
        <section key={s.key} className="panel" aria-labelledby={`policy-${s.key}`}>
          <h2 id={`policy-${s.key}`} className="h3">{t(`policy.section.${s.key}`)}</h2>
          {s.paragraphs.map((p) => <p key={p} lang="en">{p}</p>)}
          <p className="note">{t("policy.checkedAgainst")}:{" "}
            {s.evidence.map((p, i) => <span key={p}>{i > 0 && ", "}<a href={`${REPO}${p}`}><code>{p}</code></a></span>)}
          </p>
        </section>
      ))}
    </>
  );
}
