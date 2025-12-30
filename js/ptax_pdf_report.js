// File: js/ptax_pdf_report.js
// Generates PDF from currently selected PTAX property

(function () {
  const btn = document.getElementById("downloadPtaxPdfBtn");
  if (!btn) return;

  btn.addEventListener("click", generatePtaxPdf);

  function generatePtaxPdf() {
    const data = window.selectedPTAXProperty;

    if (!data) {
      alert("Please search or select a property first.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    let y = 20;

    // Title
    doc.setFontSize(18);
    doc.text("PTAX PROPERTY REPORT", 14, y);
    y += 10;

    doc.setFontSize(11);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, y);
    y += 10;

    doc.setLineWidth(0.5);
    doc.line(14, y, 195, y);
    y += 8;

    // Helper to safely print fields
    const printField = (label, value) => {
      if (!value) return;
      doc.setFont(undefined, "bold");
      doc.text(`${label}:`, 14, y);
      doc.setFont(undefined, "normal");
      doc.text(String(value), 70, y);
      y += 7;
    };

    // PROPERTY DETAILS
    doc.setFont(undefined, "bold");
    doc.text("Property Details", 14, y);
    y += 8;

    printField("Property Number", data["Property Number"]);
    printField("Property Name", data["Name of the Property"]);
    printField("Nature of Property", data["Nature of Property"]);
    printField("Address", data["Address of Property"]);

    y += 5;

    // OWNER DETAILS
    doc.setFont(undefined, "bold");
    doc.text("Owner Details", 14, y);
    y += 8;

    printField("Owner Name", data["Name of the Property Owner"]);
    printField("Owner UID", data["UID number of Property Owner"]);
    printField("Mobile", data["Telephone / Mobile Number"]);
    printField("Email", data["e-mail-id"]);

    y += 5;

    // OCCUPIER DETAILS
    doc.setFont(undefined, "bold");
    doc.text("Occupier / Tenant Details", 14, y);
    y += 8;

    printField("Occupier Name", data["Name of Occupier & Tenant"]);
    printField("Occupier UID", data["UID number of Occupier"]);

    y += 8;

    // Footer
    doc.setFontSize(10);
    doc.text("Generated from Digital Twin PTAX System", 14, 285);

    const fileName =
      "PTAX_Property_" +
      (data["Property Number"] || "Report") +
      ".pdf";

    doc.save(fileName);
  }
})();
