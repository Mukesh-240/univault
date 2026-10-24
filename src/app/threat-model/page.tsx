/**
 * THREAT MODEL — what could go wrong, what stops it, what does NOT stop it, and the files that back
 * each claim. The rows live in src/lib/trust-pages.ts; tests/trust-pages.test.ts checks every cited
 * file exists and every row cites at least one test. Headings are translated; the details are English
 * (marked lang="en" so screen readers pronounce them correctly on the Telugu page).
 */
import { getI18n } from "@/lib/i18n-server";
import { THREATS } from "@/lib/trust-pages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REPO = "https://github.com/Mukesh-240/univault/blob/main/";

export default async function ThreatModelPage() {
  const { t } = await getI18n();
  return (
    <>
      <h1>{t("threat.title")}</h1>
      <p className="lead">{t("threat.intro")}</p>
      <div className="table-scroll" role="region" aria-label={t("threat.title")} tabIndex={0}>
        <table className="threats">
          <caption>{t("threat.caption", { n: THREATS.length })}</caption>
          <thead>
            <tr>
              <th scope="col">{t("threat.colThreat")}</th>
              <th scope="col">{t("threat.colStops")}</th>
              <th scope="col">{t("threat.colNotStopped")}</th>
              <th scope="col">{t("threat.colEvidence")}</th>
            </tr>
          </thead>
          <tbody>
            {THREATS.map((r) => (
              <tr key={r.key} id={`threat-${r.key}`}>
                <th scope="row">{t(`threat.row.${r.key}`)}</th>
                <td lang="en">{r.stops}</td>
                <td lang="en">{r.notStopped}</td>
                <td><ul className="evidence">{r.evidence.map((p) => <li key={p}><a href={`${REPO}${p}`}><code>{p}</code></a></li>)}</ul></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
