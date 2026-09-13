const BRAND = {
    name: 'ProQ Pilot',
    ink: '#0B1524',
    navy: '#10253D',
    blue: '#2C8EFF',
    porcelain: '#F7F9FC',
    graphite: '#253244',
    muted: '#657388',
    platinum: '#E2E8F0',
    success: '#157A64',
    warning: '#A76A00',
    danger: '#B94444'
};

const VARIANTS = {
    info: { accent: BRAND.blue, label: 'INFORMATION' },
    success: { accent: BRAND.success, label: 'CONFIRMED' },
    warning: { accent: BRAND.warning, label: 'ACTION REQUIRED' },
    alert: { accent: BRAND.danger, label: 'NOTICE' }
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
}

function cleanPublicBaseUrl(value = process.env.PUBLIC_BASE_URL) {
    const candidate = String(value || '').trim().replace(/\/+$/, '');
    if (!candidate) return '';

    try {
        const url = new URL(candidate);
        if (!/^https?:$/.test(url.protocol) || /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(url.hostname)) {
            return '';
        }
        return url.toString().replace(/\/+$/, '');
    } catch (_) {
        return '';
    }
}

function publicAssetUrl(path, publicBaseUrl) {
    const baseUrl = cleanPublicBaseUrl(publicBaseUrl);
    const value = String(path || '').trim();
    if (!value) return '';

    try {
        const absoluteUrl = new URL(value);
        if (!/^https?:$/.test(absoluteUrl.protocol)) return '';
        if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(absoluteUrl.hostname)) {
            return baseUrl ? `${baseUrl}${absoluteUrl.pathname}${absoluteUrl.search}` : '';
        }
        return absoluteUrl.toString();
    } catch (_) {
        return baseUrl ? `${baseUrl}/${value.replace(/^\/+/, '')}` : '';
    }
}

function safeHref(value) {
    const href = String(value || '').trim();
    if (!/^https?:\/\//i.test(href) && !/^mailto:/i.test(href)) return '';
    return escapeAttribute(href);
}

function formatCurrency(value, currency = 'R') {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return `${currency}0.00`;
    return `${currency}${amount.toLocaleString('en-ZA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function paragraph(value) {
    return `<p style="margin:0 0 14px;color:${BRAND.graphite};font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.62;">${escapeHtml(value)}</p>`;
}

function richParagraph(value) {
    return `<p style="margin:0 0 14px;color:${BRAND.graphite};font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.62;">${value}</p>`;
}

function detailsTable(rows = []) {
    const content = rows
        .filter(row => row && row.label && row.value !== undefined && row.value !== null && row.value !== '')
        .map(row => {
            const value = row.html ? String(row.value) : escapeHtml(row.value);
            return `
                <tr>
                    <td valign="top" style="width:38%;padding:9px 12px 9px 0;border-bottom:1px solid ${BRAND.platinum};color:${BRAND.muted};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;">${escapeHtml(row.label)}</td>
                    <td valign="top" style="padding:9px 0;border-bottom:1px solid ${BRAND.platinum};color:${BRAND.graphite};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;line-height:1.45;word-break:break-word;">${value}</td>
                </tr>`;
        })
        .join('');

    return content
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">${content}</table>`
        : '';
}

function section(title, content) {
    if (!content) return '';
    return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 16px;border-collapse:collapse;">
            <tr>
                <td style="padding:0;">
                    ${title ? `<h2 style="margin:0 0 9px;color:${BRAND.ink};font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:1.35;letter-spacing:0;">${escapeHtml(title)}</h2>` : ''}
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid ${BRAND.platinum};border-collapse:separate;border-radius:4px;background:#FFFFFF;">
                        <tr><td style="padding:14px 16px;">${content}</td></tr>
                    </table>
                </td>
            </tr>
        </table>`;
}

function notice(message, variant = 'info') {
    const tone = VARIANTS[variant] || VARIANTS.info;
    return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 16px;">
            <tr>
                <td style="width:3px;background:${tone.accent};font-size:0;line-height:0;">&nbsp;</td>
                <td style="padding:11px 13px;background:${BRAND.porcelain};color:${BRAND.graphite};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;">${escapeHtml(message)}</td>
            </tr>
        </table>`;
}

function button({ href, label, ariaLabel }) {
    const safeUrl = safeHref(href);
    if (!safeUrl || !label) return '';
    return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:4px 0 18px;">
            <tr>
                <td align="center" bgcolor="${BRAND.navy}" style="border-radius:3px;background:${BRAND.navy};">
                    <a href="${safeUrl}" target="_blank" aria-label="${escapeAttribute(ariaLabel || label)}" style="display:inline-block;padding:12px 18px;border:1px solid ${BRAND.navy};border-radius:3px;background:${BRAND.navy};color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:1.2;text-align:center;text-decoration:none;">${escapeHtml(label)}</a>
                </td>
            </tr>
        </table>`;
}

function itemList(items = [], { showImages = false, publicBaseUrl } = {}) {
    const rows = items.map(item => {
        const imageUrl = showImages ? publicAssetUrl(item.imageUrl, publicBaseUrl) : '';
        const imageCell = imageUrl
            ? `<td valign="top" style="width:56px;padding:0 12px 0 0;"><img class="proq-item-image" src="${escapeAttribute(imageUrl)}" width="56" height="56" alt="${escapeAttribute(item.title || 'Product image')}" style="display:block;width:56px;height:56px;border:0;border-radius:3px;object-fit:cover;background:${BRAND.porcelain};"></td>`
            : '';
        const metadata = (item.meta || [])
            .filter(entry => entry)
            .map(entry => `<span style="display:inline;color:${BRAND.muted};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;">${escapeHtml(entry)}</span>`)
            .join('<span style="color:#B5C0CE;padding:0 5px;">&middot;</span>');
        return `
            <tr>
                <td style="padding:12px 0;border-bottom:1px solid ${BRAND.platinum};">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
                        <tr>
                            ${imageCell}
                            <td valign="top" style="padding:0;">
                                <p style="margin:0 0 3px;color:${BRAND.ink};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:1.4;word-break:break-word;">${escapeHtml(item.title || '')}</p>
                                ${metadata ? `<p style="margin:0;line-height:1.5;">${metadata}</p>` : ''}
                            </td>
                            ${item.amount ? `<td class="proq-item-amount" valign="top" align="right" style="padding:0 0 0 10px;color:${BRAND.graphite};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:1.4;white-space:nowrap;">${escapeHtml(item.amount)}</td>` : ''}
                        </tr>
                    </table>
                </td>
            </tr>`;
    }).join('');

    return rows
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">${rows}</table>`
        : '';
}

function createEmail({
    publicBaseUrl,
    variant = 'info',
    eyebrow,
    title,
    preview,
    intro,
    body = '',
    cta,
    footerNote
} = {}) {
    const tone = VARIANTS[variant] || VARIANTS.info;
    const logoUrl = publicAssetUrl('Images/Logos/Proq2.png', publicBaseUrl);
    const previewText = escapeHtml(preview || title || BRAND.name);
    const eyebrowText = escapeHtml(eyebrow || tone.label);
    const helpAddress = escapeAttribute(process.env.EMAIL_SUPPORT_FROM || 'support@proqpilot.com');
    const ctaHtml = cta ? button(cta) : '';
    const introHtml = intro ? paragraph(intro) : '';
    const noteHtml = footerNote ? `<p style="margin:12px 0 0;color:${BRAND.muted};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;">${escapeHtml(footerNote)}</p>` : '';

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
    <title>${escapeHtml(title || BRAND.name)}</title>
    <!--[if mso]><style>table { border-collapse: collapse; }</style><![endif]-->
    <style>
        @media screen and (max-width: 620px) {
            .proq-page-gutter { padding: 12px 8px !important; }
            .proq-shell { width: 100% !important; }
            .proq-content { padding: 22px 18px !important; }
            .proq-header { padding: 15px 18px !important; }
            .proq-footer { padding: 18px !important; }
            .proq-logo { width: 104px !important; max-width: 104px !important; height: auto !important; }
            .proq-title { font-size: 25px !important; line-height: 1.22 !important; }
            .proq-item-image { width: 48px !important; height: 48px !important; }
            .proq-item-amount { font-size: 13px !important; }
        }
        @media screen and (max-width: 380px) {
            .proq-content { padding: 20px 16px !important; }
            .proq-header { padding: 14px 16px !important; }
            .proq-footer { padding: 16px !important; }
        }
    </style>
</head>
<body style="margin:0;padding:0;background:${BRAND.porcelain};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.porcelain}" style="width:100%;margin:0;padding:0;background:${BRAND.porcelain};border-collapse:collapse;">
        <tr>
            <td class="proq-page-gutter" align="center" style="padding:20px 12px;">
                <table class="proq-shell" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;border-collapse:collapse;background:#FFFFFF;">
                    <tr><td style="height:4px;background:${tone.accent};font-size:0;line-height:0;">&nbsp;</td></tr>
                    <tr>
                        <td class="proq-header" bgcolor="${BRAND.ink}" style="padding:16px 24px;background:${BRAND.ink};">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
                                <tr>
                                    <td valign="middle" style="padding:0;">
                                        ${logoUrl ? `<img class="proq-logo" src="${escapeAttribute(logoUrl)}" width="112" alt="ProQ Pilot" style="display:block;width:112px;max-width:112px;height:auto;border:0;vertical-align:middle;">` : '<span style="display:inline-block;width:28px;height:28px;border-radius:3px;background:#FFFFFF;color:#0B1524;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;line-height:28px;text-align:center;">PQ</span>'}
                                    </td>
                                    <td valign="middle" style="padding:0 0 0 10px;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;letter-spacing:.2px;">ProQ Pilot</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td class="proq-content" style="padding:27px 28px 25px;">
                            <p style="margin:0 0 9px;color:${tone.accent};font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.25px;line-height:1.25;">${eyebrowText}</p>
                            <h1 class="proq-title" style="margin:0 0 13px;color:${BRAND.ink};font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:700;letter-spacing:-.35px;line-height:1.22;">${escapeHtml(title || BRAND.name)}</h1>
                            ${introHtml}
                            ${body}
                            ${ctaHtml}
                            ${noteHtml}
                        </td>
                    </tr>
                    <tr>
                        <td class="proq-footer" style="padding:18px 28px 20px;border-top:1px solid ${BRAND.platinum};background:#FBFCFE;">
                            <p style="margin:0;color:${BRAND.muted};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55;">Need assistance? Contact <a href="mailto:${helpAddress}" style="color:${BRAND.graphite};font-weight:700;text-decoration:underline;">ProQ Pilot Support</a>.</p>
                            <p style="margin:8px 0 0;color:#8A98AA;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.45;">&copy; ${new Date().getFullYear()} ProQ Pilot. Precision technology, thoughtfully delivered.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

function createPlainText({ title, intro, lines = [], cta, footerNote } = {}) {
    const output = [title, intro, ...lines, cta?.label && cta?.href ? `${cta.label}: ${cta.href}` : '', footerNote, 'Need assistance? Contact ProQ Pilot Support: support@proqpilot.com', `© ${new Date().getFullYear()} ProQ Pilot`]
        .filter(Boolean)
        .map(value => String(value).replace(/<[^>]*>/g, '').trim())
        .filter(Boolean);
    return output.join('\n\n');
}

module.exports = {
    BRAND,
    escapeHtml,
    cleanPublicBaseUrl,
    publicAssetUrl,
    formatCurrency,
    paragraph,
    richParagraph,
    detailsTable,
    section,
    notice,
    button,
    itemList,
    createEmail,
    createPlainText
};
