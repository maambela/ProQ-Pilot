document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('contactForm');
    const submitButton = document.getElementById('contactSubmit');
    const status = document.getElementById('contactStatus');
    const user = (() => {
        try {
            return JSON.parse(localStorage.getItem('user') || 'null');
        } catch (error) {
            return null;
        }
    })();

    if (user) {
        const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.name || '';
        form.elements.name.value = name;
        form.elements.email.value = user.email || '';
        form.elements.phone.value = user.contact || user.phone || '';
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('topic')) form.elements.topic.value = params.get('topic');
    if (params.get('order')) form.elements.orderNumber.value = params.get('order');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        status.textContent = '';
        status.style.color = 'var(--accent-teal)';
        submitButton.disabled = true;
        submitButton.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i><span>Sending...</span>";

        const payload = Object.fromEntries(new FormData(form).entries());

        try {
            const response = await fetch('/api/v1/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(result.message || 'Your message could not be sent.');
            }

            status.textContent = result.message || 'Your message has been sent.';
            form.elements.message.value = '';
            form.elements.orderNumber.value = '';
        } catch (error) {
            status.style.color = '#ff8b94';
            status.textContent = error.message;
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = "<i class='bx bx-send'></i><span>Send Message</span>";
        }
    });
});
