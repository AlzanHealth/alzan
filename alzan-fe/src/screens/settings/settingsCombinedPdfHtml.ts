type CombinedPdfSectionInput = {
  label: string;
  html: string;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const removeFixedFooter = (html: string): string => html.replace(/<div\s+class=["']footer["'][\s\S]*?<\/div>/gi, '');

export const extractPdfHtmlSection = (html: string): { styles: string; body: string } => {
  const styles = Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))
    .map(match => match[1]?.trim())
    .filter((value): value is string => Boolean(value))
    .join('\n\n');
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = removeFixedFooter((bodyMatch?.[1] ?? html).trim());

  return { styles, body };
};

export const createStatusSectionHtml = (title: string, message: string): string => `
  <html>
    <head>
      <style>
        .combined-status {
          min-height: 520px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          color: #333;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          padding: 80px 40px;
        }
        .combined-status-title {
          font-size: 26px;
          font-weight: 800;
          color: #007AFF;
          margin-bottom: 12px;
        }
        .combined-status-message {
          font-size: 14px;
          line-height: 1.5;
          color: #666;
          max-width: 440px;
        }
      </style>
    </head>
    <body>
      <div class="combined-status">
        <div class="combined-status-title">${escapeHtml(title)}</div>
        <div class="combined-status-message">${escapeHtml(message)}</div>
      </div>
    </body>
  </html>
`;

export const createCombinedPdfHtml = ({
  sections,
  footer,
}: {
  sections: CombinedPdfSectionInput[];
  footer: string;
}): string => {
  const extractedSections = sections.map(section => ({
    ...section,
    extracted: extractPdfHtmlSection(section.html),
  }));
  const sectionStyles = extractedSections
    .map(section => section.extracted.styles)
    .filter(Boolean)
    .join('\n\n');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { margin: 20px; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #333;
          margin: 0;
          padding: 40px;
          -webkit-print-color-adjust: exact;
        }
        .combined-report-section {
          page-break-before: always;
        }
        .combined-report-section:first-child {
          page-break-before: auto;
        }
        .combined-section-label {
          color: #007AFF;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1px;
          text-transform: uppercase;
          margin-bottom: 10px;
        }
        .footer {
          position: fixed;
          bottom: 20px;
          left: 40px;
          right: 40px;
          text-align: center;
          font-size: 10px;
          color: #C7C7CC;
        }
        ${sectionStyles}
        .combined-report-section .daily-progress {
          break-before: auto;
          page-break-before: auto;
        }
        .combined-report-footer {
          position: static;
          margin-top: 24px;
          break-inside: avoid;
          page-break-inside: avoid;
        }
      </style>
    </head>
    <body>
      ${extractedSections
        .map(
          section => `
            <section class="combined-report-section">
              <div class="combined-section-label">${escapeHtml(section.label)}</div>
              ${section.extracted.body}
            </section>
          `,
        )
        .join('')}
      <div class="footer combined-report-footer">${escapeHtml(footer)}</div>
    </body>
    </html>
  `;
};
