const form = document.querySelector('#application-form');
const alertBox = document.querySelector('#form-alert');

function setAlert(message, type = 'success') {
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.className = '';
  alertBox.classList.add(type);
}

async function submitApplication(event) {
  event.preventDefault();

  const role = document.body.dataset.role || 'unknown';
  const discordId = document.querySelector('#discord-id')?.value.trim();
  const discordUsername = document.querySelector('#discord-username')?.value.trim();
  const devdockUsername = document.querySelector('#devdock-username')?.value.trim();
  const email = document.querySelector('#email')?.value.trim();
  const experience = document.querySelector('#experience')?.value.trim();
  const scenario1 = document.querySelector('#scenario-1')?.value.trim();
  const scenario2 = document.querySelector('#scenario-2')?.value.trim();
  const scenario3 = document.querySelector('#scenario-3')?.value.trim();

  const agreements = Array.from(document.querySelectorAll('.agreement-checkbox')).every((checkbox) => checkbox.checked);

  if (!discordUsername || !devdockUsername || !email || !experience || !scenario1 || !scenario2 || !scenario3) {
    setAlert('Please complete all required fields before submitting.', 'error');
    return;
  }

  if (!agreements) {
    setAlert('Please agree to all requirements to continue.', 'error');
    return;
  }

  const payload = {
    applicationType: role,
    discordId,
    discordUsername,
    devdockUsername,
    email,
    responses: { experience, scenario1, scenario2, scenario3 },
  };

  try {
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.error || 'Server rejected the application.');
    }

    const data = await res.json();
    setAlert(`Application submitted! Your request ID is ${data.applicationId}. You will receive a decision via Discord DM.`, 'success');
    form.reset();
  } catch (error) {
    console.error('Application submit error:', error);
    setAlert(error.message || 'Unable to submit application at this time.', 'error');
  }
}

if (form) {
  form.addEventListener('submit', submitApplication);
}
