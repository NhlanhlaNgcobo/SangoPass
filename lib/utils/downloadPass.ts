import type { VisitorInvitation } from "@/types";

export async function downloadPass(
  svg: SVGSVGElement,
  invitation: VisitorInvitation,
) {
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(svg)], {
      type: "image/svg+xml",
    }),
  );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = reject;
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1180;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Download unavailable.");
    ctx.fillStyle = "#fafaf6";
    ctx.fillRect(0, 0, 900, 1180);
    ctx.fillStyle = "#143e35";
    ctx.fillRect(0, 0, 900, 150);
    ctx.fillStyle = "#d5ed9f";
    ctx.font = "bold 48px Arial";
    ctx.fillText("SangoPass.", 65, 92);
    ctx.fillStyle = "#143e35";
    ctx.font = "bold 38px Arial";
    ctx.fillText(invitation.visitorName, 65, 225, 770);
    ctx.font = "24px Arial";
    ctx.fillText(invitation.propertyName, 65, 275, 770);
    ctx.fillText(
      `${invitation.unitNumber} · Visiting ${invitation.tenantName}`,
      65,
      316,
      770,
    );
    ctx.fillText(
      `${invitation.visitDate} · ${invitation.expectedArrival}–${invitation.expectedDeparture} SAST`,
      65,
      357,
      770,
    );
    ctx.fillStyle = "#fff";
    ctx.fillRect(185, 405, 530, 530);
    ctx.drawImage(image, 210, 430, 480, 480);
    ctx.fillStyle = "#143e35";
    ctx.textAlign = "center";
    ctx.font = "bold 32px Arial";
    ctx.fillText(invitation.referenceNumber, 450, 1005);
    ctx.font = "22px Arial";
    ctx.fillText("Show this pass at reception or the gate.", 450, 1055);
    ctx.font = "18px Arial";
    ctx.fillStyle = "#647268";
    ctx.fillText("Demo pass · Validity is checked at arrival.", 450, 1110);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("Download unavailable.")),
        "image/png",
      ),
    );
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `SangoPass-${invitation.referenceNumber}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  } finally {
    URL.revokeObjectURL(url);
  }
}
