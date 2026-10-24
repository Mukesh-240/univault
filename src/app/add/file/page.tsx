/**
 * UPLOAD A FILE — in this demo you type the details of a document you already have. The details go through
 * the same front door as every other document (ingestDocument via POST /api/upload) and then show up in
 * "Uploaded by me", not yet checked with any issuer.
 */
import { getI18n } from "@/lib/i18n-server";
import { AddFileForm } from "./AddFileForm";

export const dynamic = "force-dynamic";

export default async function AddFilePage() {
  const { t } = await getI18n();
  return (
    <>
      <h1>{t("add.file.title")}</h1>
      <p className="lead">{t("add.file.intro")}</p>
      <AddFileForm />
    </>
  );
}
