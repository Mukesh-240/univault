/**
 * ADD A DOCUMENT FROM A FILE — upload a PDF or a photo of a document you already have. The text is read for you,
 * you check every detail, and it is saved through the same front door as every other document (ingestDocument),
 * with the original file kept beside it. It shows under "Uploaded by me", not yet checked with any issuer.
 */
import { Uploader } from "@/components/Uploader";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function AddFilePage() {
  const { t } = await getI18n();
  return (
    <>
      <h1>{t("add.file.title")}</h1>
      <p className="lead">{t("add.file.intro")}</p>
      <Uploader />
    </>
  );
}
