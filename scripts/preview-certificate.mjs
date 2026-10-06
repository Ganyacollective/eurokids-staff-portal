// Render a fee certificate, so the document can be read before one is issued.
import fs from "node:fs";
import { renderCertificatePdf } from "../src/lib/certificate-pdf.ts";
fs.writeFileSync(process.argv[2] || "certificate.pdf", await renderCertificatePdf({
  reference: "EK-RMB-00042",
  issuedOn: "1 November 2026",
  partyName: "Mrs Sneha Deshmukh",
  employerName: "Infosys Limited",
  childName: "Aarav Deshmukh",
  childClass: "Nursery · Day care",
  childUin: "EK/1769/0142",
  periodLabel: "October 2026",
  description: "Day care fee",
  amount: 8500,
  paidOn: "3 October 2026",
  mode: "UPI",
  entityName: "EuroKids JMD Enclave, operated by Veena Educational Services",
  signedByName: "Neeta Saxena",
  signedByRole: "Owner and Director",
}));
console.log("ok");
