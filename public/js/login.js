const message = document.getElementById('message');
const submit = document.getElementById('submit');

// Already signed in? Go straight through.
currentUser().then((user) => { if (user) location.replace(homeFor(user)); });

async function signIn() {
  message.className = 'alert';
  message.textContent = '';
  submit.disabled = true;

  try {
    const { user } = await apiJson('/api/auth/login', 'POST', {
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
    });
    location.replace(homeFor(user));
  } catch (err) {
    showError(message, err.message);
    submit.disabled = false;
  }
}

submit.addEventListener('click', signIn);
document.querySelectorAll('#email, #password').forEach((input) => {
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') signIn(); });
});
