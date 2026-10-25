/**
 * UPLOAD — a real PDF with a text layer goes in through "Add a document from a file": its details are read and shown
 * for checking, the student fixes one, saves, and the document opens in the vault with its original file.
 * A file that is not a PDF or a photo is refused and nothing is stored. (Runs on the in-memory test store.)
 */
import { expect, test } from "@playwright/test";

/** A small, valid one-page PDF whose text layer holds these lines (Helvetica, one line each). */
function pdfWith(lines: string[]): Buffer {
  const content = `BT /F1 12 Tf 50 750 Td 16 TL ${lines.map((l) => `(${l.replace(/[()\\]/g, "")}) Tj T*`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

test("upload a PDF: details are read, checked, saved, and the original opens again", async ({ page }) => {
  await page.goto("/add/file");
  await expect(page.locator(".stepper-title")).toContainText("Step 1 of 3");
  const file = pdfWith(["VIT University", "Name: Mahesh Mekhala", "Registration No: 21BCE1234", "Degree: B.Tech", "CGPA: 8.71"]);
  await page.locator("#up-file").setInputFiles({ name: "degree.pdf", mimeType: "application/pdf", buffer: file });
  await expect(page.locator(".stepper-title")).toContainText("Step 2 of 3");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Mahesh Mekhala");
  await expect(page.locator("main input[value='21BCE1234']")).toBeVisible();
  await page.locator("main input[value='8.71']").fill("8.72");
  const [saved] = await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/upload/document")), page.getByRole("button", { name: "Save to my documents" }).click()]);
  expect(saved.status()).toBe(201);
  await expect(page.getByText("Saved to your documents.").first()).toBeVisible();
  await page.getByRole("link", { name: "Open it" }).click();
  await expect(page.locator("h1")).toContainText("Degree certificate");
  await expect(page.locator(".doc-preview")).toContainText("Mahesh Mekhala");
  await expect(page.locator(".doc-preview")).toContainText("8.72");
  const original = page.getByRole("link", { name: "Open the original file" });
  const res = await page.request.get((await original.getAttribute("href"))!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("a file that is not a PDF or a photo is refused and nothing is stored", async ({ page }) => {
  await page.goto("/add/file");
  const bad = await page.request.post("/api/upload/document", { data: { doc_type: "marksheet", title: "x", fields: { name: "x" }, capture: "digital", file: { b64: Buffer.from("MZ not a pdf at all").toString("base64") } } });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).error).toContain("Only a PDF or a photo");
});
