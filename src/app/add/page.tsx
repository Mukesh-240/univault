/**
 * ADD A DOCUMENT — two big choices: a photo of a paper document (the OCR screen reads it, you check it),
 * or a file you already have (in this demo you type its details; no file is uploaded anywhere).
 */
import { Camera, Upload } from "lucide-react";
import Link from "next/link";
import { getI18n } from "@/lib/i18n-server";
import { PageHead } from "@/components/PageHead";

export const dynamic = "force-dynamic";

export default async function AddPage() {
  const { t } = await getI18n();
  return (
    <>
      <PageHead title={t("add.title")} purpose={t("add.intro")} links={[{ href: "/documents", label: t("nav2.docs") }]} />
      <div className="grid">
        <Link href="/ocr" className="choice"><Camera size={32} aria-hidden="true" /><div><strong>{t("home.add.photo")}</strong><span>{t("home.add.photoNote")}</span></div></Link>
        <Link href="/add/file" className="choice"><Upload size={32} aria-hidden="true" /><div><strong>{t("home.add.file")}</strong><span>{t("home.add.fileNote")}</span></div></Link>
      </div>
    </>
  );
}
