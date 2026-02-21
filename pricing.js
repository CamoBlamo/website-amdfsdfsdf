document.addEventListener('DOMContentLoaded', () => {
    const subscribeButton = document.getElementById('subscribeButton');
    const messageEl = document.getElementById('pricingMessage');

    function setMessage(text, isError) {
        messageEl.textContent = text;
        messageEl.style.color = isError ? '#e74c3c' : 'var(--secondary-text-clr)';
    }

    if (subscribeButton) {
        subscribeButton.addEventListener('click', async () => {
            setMessage('Starting checkout...', false);
            try {
                const response = await fetch('/create-checkout-session', {
                    method: 'POST',
                    credentials: 'include'
                });
                const data = await response.json();

                if (!response.ok || !data.success) {
                    const msg = data && data.errors ? data.errors.join(' ') : 'Failed to start checkout.';
                    setMessage(msg, true);
                    if (response.status === 401) {
                        window.location.href = '/login.html';
                    }
                    return;
                }

                window.location.href = data.url;
            } catch (error) {
                console.error('Checkout error', error);
                setMessage('Failed to start checkout.', true);
            }
        });
    }
});
