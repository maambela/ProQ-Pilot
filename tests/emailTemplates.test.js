const test = require('node:test');
const assert = require('node:assert/strict');

const {
    BRAND,
    createEmail,
    createBrandedEmailHtml,
    createPaymentDeclineEmail
} = require('../utils/emailTemplates');

test('shared email template uses the requested logo and thin typography', () => {
    const html = createEmail({ title: 'Test email', intro: 'Thin and readable.' });

    assert.equal(BRAND.logoUrl, 'https://i.postimg.cc/74WHX5qj/Proq-2.png');
    assert.equal(BRAND.emailHeader, '#000000');
    assert.match(html, /74WHX5qj\/Proq-2\.png/);
    assert.match(html, /background:#000000/);
    assert.doesNotMatch(html, /height:4px;background:/);
    assert.doesNotMatch(html, /font-weight\s*:\s*(?:[5-9]\d{2}|bold|bolder)/i);
    assert.match(html, /h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6,\s*b,\s*strong,\s*th\s*\{\s*font-weight:\s*300\s*!important;\s*\}/);
});

test('payment decline email includes safe reference, amount and retry guidance', () => {
    const mail = createPaymentDeclineEmail({
        customerName: '<Thandi>',
        orderId: 42,
        amount: 1250,
        retryUrl: 'https://example.com/store.html'
    });

    assert.match(mail.html, /Payment declined/i);
    assert.match(mail.html, /#42/);
    assert.match(mail.html, /R1[\s ]*250,00|R1250/);
    assert.match(mail.html, /Retry checkout/);
    assert.doesNotMatch(mail.html, /provider|raw|error payload/i);
    assert.match(mail.html, /&lt;Thandi&gt;/);
    assert.doesNotMatch(mail.html, /<Thandi>/);
    assert.match(mail.text, /Payment declined/);
    assert.match(mail.text, /Order reference: #42/);
    assert.match(mail.text, /No payment was completed/);
});

test('legacy HTML branding normalizes bold emphasis', () => {
    const html = createBrandedEmailHtml(
        '<html><body><h2 style="font-weight:700">Important</h2><p style="font-weight:500">Also light</p><strong>Still clear</strong></body></html>',
        { subject: 'Legacy notice' }
    );

    assert.match(html, /font-weight:300/);
    assert.doesNotMatch(html, /font-weight\s*:\s*(?:[5-9]\d{2}|bold|bolder)/i);
    const headingTag = html.match(/<h2\b[^>]*>/i)?.[0] || '';
    assert.equal((headingTag.match(/\sstyle=/gi) || []).length, 1);
});
