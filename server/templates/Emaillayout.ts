type GradientColors = {
    from: string;
    to: string;
};


export function emailLayout({
    title,
    subtitle,
    gradient,
    bodyHtml,
}: {
    title: string;
    subtitle?: string;
    gradient: GradientColors;
    bodyHtml: string;
}) {
    return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, ${gradient.from}, ${gradient.to}); padding: 24px 28px;">
        <h2 style="color: #fff; margin: 0; font-size: 20px;">${title}</h2>
        ${subtitle
            ? `<p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 13px;">${subtitle}</p>`
            : ""
        }
      </div>

      <div style="padding: 28px;">
        ${bodyHtml}
      </div>
    </div>
  `;
}